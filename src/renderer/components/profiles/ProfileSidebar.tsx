import { CircleHelp, Plus, Search, Settings } from "lucide-react";
import type { AppSnapshot, ProviderProfile } from "../../../shared/types";
import { formatDate, PROFILE_COLORS } from "../../lib/profile-utils";

export function ProfileSidebar({
  snapshot,
  profiles,
  selectedId,
  query,
  onQueryChange,
  onAdd,
  onSelect,
  onOpenSettings,
}: {
  snapshot: AppSnapshot;
  profiles: ProviderProfile[];
  selectedId: string;
  query: string;
  onQueryChange: (query: string) => void;
  onAdd: () => void;
  onSelect: (id: string) => void;
  onOpenSettings: () => void;
}) {
  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <img className="brand-mark" src="./icon.png" alt="" />
        <div className="brand-copy">
          <strong>Grok Go</strong>
          <span>第三方供应商档案</span>
        </div>
      </div>

      <div className="sidebar-toolbar">
        <label className="search-field">
          <Search size={15} />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="搜索供应商…"
            aria-label="搜索供应商"
          />
        </label>
        <button
          className="icon-button solid"
          onClick={onAdd}
          title="新建供应商"
          aria-label="新建供应商"
        >
          <Plus size={18} />
        </button>
      </div>

      <nav className="profile-list" aria-label="供应商档案">
        {profiles.length === 0 ? (
          <div className="configured-model-empty" style={{ borderRadius: 8 }}>
            没有匹配的供应商
          </div>
        ) : (
          profiles.map((profile) => {
            const index = snapshot.profiles.findIndex((item) => item.id === profile.id);
            const active =
              snapshot.activeProfileId === profile.id && snapshot.activeMatchesConfig;
            const selected = selectedId === profile.id;
            return (
              <button
                key={profile.id}
                className={`profile-row ${selected ? "selected" : ""}`}
                onClick={() => onSelect(profile.id)}
              >
                <span
                  className="profile-avatar"
                  style={{
                    background: PROFILE_COLORS[Math.max(0, index) % PROFILE_COLORS.length],
                  }}
                >
                  {profile.name.trim().slice(0, 1).toUpperCase() || "?"}
                </span>
                <span className="profile-copy">
                  <strong>{profile.name}</strong>
                  <span className={active ? "active-copy" : ""}>
                    {active
                      ? "当前生效"
                      : `上次使用：${formatDate(profile.lastUsedAt)}`}
                  </span>
                </span>
                <span className={`profile-status ${active ? "live" : ""}`} />
              </button>
            );
          })
        )}
      </nav>

      <div className="sidebar-footer">
        <button className="ghost-button" onClick={onOpenSettings}>
          <Settings size={15} />
          设置
        </button>
        <button
          className="ghost-button"
          onClick={() =>
            window.alert(
              "Grok Go v1.6.2\n轻量切换 Grok Build 的第三方供应商配置。",
            )
          }
        >
          <CircleHelp size={15} />
          关于
        </button>
      </div>
    </aside>
  );
}
