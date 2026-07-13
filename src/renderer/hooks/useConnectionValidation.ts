import { useState, type Dispatch, type SetStateAction } from "react";
import type { ProviderProfile, ValidationResult } from "../../shared/types";

export function useConnectionValidation(
  draft: ProviderProfile | null,
  setDraft: Dispatch<SetStateAction<ProviderProfile | null>>,
  setWorkspaceError: Dispatch<SetStateAction<string>>,
) {
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const [diagnosticOpen, setDiagnosticOpen] = useState(false);
  const [diagnosticError, setDiagnosticError] = useState("");

  const reset = () => {
    setValidation(null);
    setModelOptions([]);
    setDiagnosticOpen(false);
    setDiagnosticError("");
  };

  const testConnection = async (): Promise<ValidationResult | null> => {
    if (!draft) return null;
    setValidating(true);
    setWorkspaceError("");
    setDiagnosticError("");
    setDiagnosticOpen(true);
    try {
      const result = await window.grokApi.validateProfile(draft);
      setValidation(result);
      setModelOptions(result.models);
      if (result.ok) {
        const validated = { ...draft, lastValidatedAt: new Date().toISOString() };
        setDraft(validated);
      }
      return result;
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setDiagnosticError(message);
      return null;
    } finally {
      setValidating(false);
    }
  };

  return {
    validation,
    modelOptions,
    validating,
    diagnosticOpen,
    diagnosticError,
    setDiagnosticOpen,
    reset,
    testConnection,
  };
}
