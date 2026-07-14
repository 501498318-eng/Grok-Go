import { useCallback, useEffect, useMemo, useState } from "react";
import { defaultConfiguredModelSettings } from "../../shared/model-settings";
import type {
  AppSnapshot,
  ConfiguredModelSettings,
  ProviderProfile,
} from "../../shared/types";
import {
  blankProfile,
  cloneProfile,
  tomlPreview,
} from "../lib/profile-utils";
import type { BusyAction, ProfileUpdater } from "../types";
import { useConnectionValidation } from "./useConnectionValidation";

export function useProviderWorkspace() {
  const [snapshot, setSnapshot] = useState<AppSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [draft, setDraft] = useState<ProviderProfile | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [mutationBusy, setMutationBusy] = useState<BusyAction>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const connection = useConnectionValidation(draft, setDraft, setError);
  const busy: BusyAction = connection.validating ? "validate" : mutationBusy;

  const hydrate = useCallback(
    (next: AppSnapshot, preferredId?: string) => {
      setSnapshot(next);
      const id =
        preferredId ?? selectedId ?? next.activeProfileId ?? next.profiles[0]?.id ?? "";
      const selected =
        next.profiles.find((profile) => profile.id === id) ?? next.profiles[0];
      if (selected) {
        setSelectedId(selected.id);
        setDraft(cloneProfile(selected));
      }
    },
    [selectedId],
  );

  useEffect(() => {
    window.grokApi
      .loadSnapshot()
      .then((next) => hydrate(next))
      .catch((reason) => setError(String(reason)));
  }, []); // Initial Electron bridge hydration only.

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const sourceProfile = snapshot?.profiles.find((profile) => profile.id === selectedId);
  const dirty = Boolean(
    draft && sourceProfile && JSON.stringify(draft) !== JSON.stringify(sourceProfile),
  );
  const previewLines = useMemo(() => (draft ? tomlPreview(draft) : []), [draft]);
  const filteredProfiles = useMemo(() => {
    if (!snapshot) return [];
    const needle = query.trim().toLowerCase();
    if (!needle) return snapshot.profiles;
    return snapshot.profiles.filter(
      (profile) =>
        profile.name.toLowerCase().includes(needle) ||
        profile.baseUrl.toLowerCase().includes(needle) ||
        profile.defaultModel.toLowerCase().includes(needle),
    );
  }, [snapshot, query]);

  const update: ProfileUpdater = (key, value) => {
    setDraft((current) =>
      current
        ? {
            ...current,
            [key]: value,
            ...(key === "protocol" && value === "openai-chat"
              ? { compatibilityProxy: false }
              : {}),
          }
        : current,
    );
    if (key === "baseUrl" || key === "apiKey" || key === "protocol") {
      connection.reset();
    }
  };

  const updateDefaultModel = (defaultModel: string) => {
    setDraft((current) => {
      if (!current) return current;
      const configuredModels = [
        ...new Set(
          [defaultModel, ...current.configuredModels]
            .map((model) => model.trim())
            .filter(Boolean),
        ),
      ];
      return {
        ...current,
        defaultModel,
        configuredModels,
        modelSettings: {
          ...current.modelSettings,
          ...(defaultModel && !current.modelSettings[defaultModel]
            ? { [defaultModel]: defaultConfiguredModelSettings(defaultModel) }
            : {}),
        },
      };
    });
  };

  const addConfiguredModel = (modelId: string) => {
    const normalized = modelId.trim();
    if (!normalized) return;
    setDraft((current) =>
      current
        ? {
            ...current,
            configuredModels: [...new Set([...current.configuredModels, normalized])],
            modelSettings: {
              ...current.modelSettings,
              [normalized]:
                current.modelSettings[normalized] ??
                defaultConfiguredModelSettings(normalized),
            },
          }
        : current,
    );
  };

  const removeConfiguredModel = (modelId: string) => {
    setDraft((current) => {
      if (!current || current.defaultModel === modelId) return current;
      const modelSettings = { ...current.modelSettings };
      delete modelSettings[modelId];
      return {
        ...current,
        configuredModels: current.configuredModels.filter((item) => item !== modelId),
        modelSettings,
      };
    });
  };

  const updateConfiguredModelSettings = (
    modelId: string,
    patch: Partial<ConfiguredModelSettings>,
  ) => {
    setDraft((current) => {
      if (!current || !current.configuredModels.includes(modelId)) return current;
      return {
        ...current,
        modelSettings: {
          ...current.modelSettings,
          [modelId]: {
            ...defaultConfiguredModelSettings(modelId),
            ...current.modelSettings[modelId],
            ...patch,
          },
        },
      };
    });
  };

  const selectProfile = (id: string) => {
    if (dirty && !window.confirm("当前档案有未应用的修改，确定放弃吗？")) return;
    const selected = snapshot?.profiles.find((profile) => profile.id === id);
    if (!selected) return;
    setSelectedId(id);
    setDraft(cloneProfile(selected));
    connection.reset();
    setError("");
  };

  const addProfile = () => {
    if (dirty && !window.confirm("当前档案有未应用的修改，确定放弃吗？")) return;
    const created = blankProfile();
    setSelectedId(created.id);
    setDraft(created);
    connection.reset();
  };

  const apply = async () => {
    if (!draft || !snapshot) return;
    if (!connection.validation?.ok) {
      const result = await connection.testConnection();
      if (!result?.ok && !window.confirm("连接尚未验证成功，仍要强制应用此配置吗？")) {
        return;
      }
    }
    setMutationBusy("apply");
    setError("");
    try {
      let result = await window.grokApi.applyProfile(draft, {
        expectedHash: snapshot.configHash ?? null,
      });
      if (
        result.conflict &&
        window.confirm("config.toml 已被其他程序修改。仍要覆盖吗？")
      ) {
        result = await window.grokApi.applyProfile(draft, { force: true });
      }
      hydrate(result.snapshot, draft.id);
      if (result.ok) setToast(`${result.message}，新 Grok 会话将使用此配置`);
      else setError(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setMutationBusy(null);
    }
  };

  const restore = async () => {
    if (!snapshot || !window.confirm("恢复上一份备份？当前配置会成为新的备份。")) return;
    setMutationBusy("restore");
    try {
      const result = await window.grokApi.restoreBackup(snapshot.configHash);
      hydrate(result.snapshot);
      if (result.ok) setToast(result.message);
      else setError(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setMutationBusy(null);
    }
  };

  const remove = async () => {
    if (!draft || !snapshot || !snapshot.profiles.some((item) => item.id === draft.id)) {
      return;
    }
    if (!window.confirm(`删除供应商“${draft.name}”？`)) return;
    try {
      const next = await window.grokApi.deleteProfile(draft.id);
      setSelectedId("");
      hydrate(next, next.profiles[0]?.id);
      setToast("供应商档案已删除");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const copyPreview = async () => {
    await navigator.clipboard.writeText(previewLines.join("\n"));
    setToast("TOML 预览已复制");
  };

  const isActive = Boolean(
    snapshot &&
      draft &&
      snapshot.activeProfileId === draft.id &&
      snapshot.activeMatchesConfig,
  );
  const modelsEndpoint = draft
    ? `${draft.baseUrl.replace(/\/+$/, "")}/models`
    : "";

  return {
    snapshot,
    draft,
    selectedId,
    validation: connection.validation,
    modelOptions: connection.modelOptions,
    showKey,
    busy,
    settingsOpen,
    toast,
    error,
    query,
    diagnosticOpen: connection.diagnosticOpen,
    diagnosticError: connection.diagnosticError,
    dirty,
    previewLines,
    filteredProfiles,
    isActive,
    modelsEndpoint,
    hydrate,
    setShowKey,
    setSettingsOpen,
    setToast,
    setError,
    setQuery,
    setDiagnosticOpen: connection.setDiagnosticOpen,
    update,
    updateDefaultModel,
    addConfiguredModel,
    removeConfiguredModel,
    updateConfiguredModelSettings,
    selectProfile,
    addProfile,
    testConnection: connection.testConnection,
    apply,
    restore,
    remove,
    copyPreview,
  };
}
