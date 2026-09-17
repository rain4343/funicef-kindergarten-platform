"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { UserRole } from "@/lib/rbac";
import { canSubmitForm, canWriteSite } from "@/lib/rbac";
import {
  actorKindergartens,
  canAccessSite,
  childrenTotalFromAges,
  normalizeKindergarten,
  nextKindergartenCode,
  savePlatform,
  userMatchesLogin,
  userSiteIds,
  type PlatformKindergarten,
  type PlatformState,
  type PlatformUser,
} from "@/lib/platform-store";
import { normalizeEducationDirectorateId } from "@/content/education-directorates";
import { apiFetch } from "@/lib/api";

type PlatformContextValue = {
  ready: boolean;
  state: PlatformState;
  currentUser: PlatformUser | undefined;
  myKindergartens: PlatformKindergarten[];
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  addKindergarten: (input: {
    name: string;
    managerName: string;
    managerMobile: string;
    educationDirectorateId: string;
    childrenAge4: string;
    childrenAge5: string;
  }) => Promise<string | null>;
  addUserToKindergarten: (input: {
    kindergartenId: string;
    educationDirectorateId?: string;
    displayName: string;
    password: string;
    role: UserRole;
  }) => Promise<string | null>;
  updateKindergarten: (
    id: string,
    patch: Partial<PlatformKindergarten>,
  ) => Promise<boolean>;
  deleteKindergarten: (id: string) => Promise<boolean>;
  saveSubmission: (input: {
    kindergartenId: string;
    formCode: "FORM_1" | "FORM_2";
    form1Answers?: Record<string, string>;
    form2Plans?: Record<string, Record<string, string>>;
  }) => Promise<boolean>;
};

const PlatformContext = createContext<PlatformContextValue | null>(null);

export function PlatformProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<PlatformState>(() => ({
    kindergartens: [],
    users: [],
    children: [],
    submissions: [],
    sessionUserId: null,
  }));
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const actor = await apiFetch("/auth/me") as PlatformUser & { assignedKindergartenIds?: string[] };
        const payload = await apiFetch("/platform/state") as { kindergartens: Record<string, unknown>[] };
        const sites = payload.kindergartens.map((site) => normalizeKindergarten(site));
        const user: PlatformUser = {
          ...actor,
          username: actor.email,
          assignedKindergartenIds: actor.assignedKindergartenIds ?? [],
        };
        setState({ kindergartens: sites, users: [user], children: [], submissions: [], sessionUserId: user.id });
      } catch {
        setState({ kindergartens: [], users: [], children: [], submissions: [], sessionUserId: null });
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const commit = useCallback((next: PlatformState) => {
    setState(next);
    savePlatform(next);
  }, []);

  const currentUser = useMemo(
    () => state.users.find((user) => user.id === state.sessionUserId),
    [state],
  );

  const myKindergartens = useMemo(
    () => actorKindergartens(state, currentUser),
    [state, currentUser],
  );

  const login = useCallback(async (username: string, password: string) => {
    try {
      await apiFetch("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      window.location.reload();
      return true;
    } catch {
      return false;
    }
  }, []);

  const logout = useCallback(async () => {
    await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
    setState({ kindergartens: [], users: [], children: [], submissions: [], sessionUserId: null });
  }, []);

  const addKindergarten = useCallback(
    async (input: {
      name: string;
      managerName: string;
      managerMobile: string;
      educationDirectorateId: string;
      childrenAge4: string;
      childrenAge5: string;
    }) => {
      if (!currentUser) {
        return "need_login";
      }
      if (currentUser.role !== "SUPER_ADMIN") {
        return "forbidden";
      }
      const name = input.name.trim();
      if (!name) {
        return "missing_name";
      }
      const total = childrenTotalFromAges(
        input.childrenAge4,
        input.childrenAge5,
      );
      const site: PlatformKindergarten = {
        id: crypto.randomUUID(),
        code: nextKindergartenCode(state.kindergartens),
        nameEn: name,
        nameAr: name,
        nameCkb: name,
        managerName: input.managerName.trim(),
        managerMobile: input.managerMobile.trim(),
        childrenAge4: input.childrenAge4.trim(),
        childrenAge5: input.childrenAge5.trim(),
        childrenTotal: total,
        educationDirectorateId: normalizeEducationDirectorateId(
          input.educationDirectorateId,
        ),
        governorate: "",
        address: "",
        notes: "",
        childrenCount: total,
        staffCount: "",
        createdAt: new Date().toISOString(),
      };
      try {
        await apiFetch("/platform/kindergartens", {
          method: "POST",
          body: JSON.stringify({ name: site.nameEn, educationDirectorateId: site.educationDirectorateId }),
        });
        window.location.reload();
        return null;
      } catch {
        return "save_failed";
      }
    },
    [commit, currentUser, state],
  );

  const addUserToKindergarten = useCallback(
    async (input: {
      kindergartenId: string;
      educationDirectorateId?: string;
      displayName: string;
      password: string;
      role: UserRole;
    }) => {
      if (currentUser?.role !== "SUPER_ADMIN") {
        return "forbidden";
      }
      if (input.role === "SUPER_ADMIN") {
        return "forbidden";
      }
      const displayName = input.displayName.trim();
      if (!displayName) {
        return "missing_name";
      }
      const username = displayName;
      if (state.users.some((user) => userMatchesLogin(user, username))) {
        return "duplicate_name";
      }
      if (input.role === "DISTRICT_EDUCATION") {
        const educationDirectorateId = normalizeEducationDirectorateId(
          input.educationDirectorateId ?? "",
        );
        if (!educationDirectorateId) {
          return "missing_directorate";
        }
        try {
          await apiFetch("/platform/users", { method: "POST", body: JSON.stringify({ ...input, displayName, kindergartenId: undefined }) });
          return null;
        } catch {
          return "save_failed";
        }
      }
      const kindergartenId = input.kindergartenId.trim();
      if (!kindergartenId || !state.kindergartens.some((site) => site.id === kindergartenId)) {
        return "missing_site";
      }
      try {
        await apiFetch("/platform/users", { method: "POST", body: JSON.stringify({ ...input, displayName, kindergartenId }) });
        return null;
      } catch {
        return "save_failed";
      }
    },
    [commit, currentUser, state],
  );

  const updateKindergarten = useCallback(
    async (id: string, patch: Partial<PlatformKindergarten>) => {
      if (!canAccessSite(currentUser, id, state.kindergartens)) {
        return false;
      }
      if (!currentUser || !canWriteSite(currentUser.role)) {
        return false;
      }
      const nextSite = state.kindergartens.find((site) => site.id === id);
      if (!nextSite) return false;
      try {
        await apiFetch(`/platform/kindergartens/${id}`, {
          method: "PATCH",
          body: JSON.stringify({
            nameEn: patch.nameEn ?? nextSite.nameEn,
            nameAr: patch.nameAr ?? nextSite.nameAr,
            nameCkb: patch.nameCkb ?? nextSite.nameCkb,
            educationDirectorateId: patch.educationDirectorateId ?? nextSite.educationDirectorateId,
          }),
        });
        commit({
          ...state,
          kindergartens: state.kindergartens.map((site) => {
          if (site.id !== id) {
            return site;
          }
          const next = {
            ...site,
            ...patch,
            id: site.id,
            educationDirectorateId: normalizeEducationDirectorateId(
              patch.educationDirectorateId ?? site.educationDirectorateId,
            ),
          };
          const total = childrenTotalFromAges(
            next.childrenAge4,
            next.childrenAge5,
          );
          return { ...next, childrenTotal: total, childrenCount: total };
          }),
        });
        return true;
      } catch {
        return false;
      }
    },
    [commit, currentUser, state],
  );

  const deleteKindergarten = useCallback(
    async (id: string) => {
      if (currentUser?.role !== "SUPER_ADMIN") {
        return false;
      }
      if (!state.kindergartens.some((site) => site.id === id)) {
        return false;
      }
      try {
        await apiFetch(`/platform/kindergartens/${id}`, { method: "DELETE" });
      } catch {
        return false;
      }
      commit({
        ...state,
        kindergartens: state.kindergartens.filter((site) => site.id !== id),
        children: state.children.filter((child) => child.kindergartenId !== id),
        submissions: (state.submissions ?? []).filter(
          (row) => row.kindergartenId !== id,
        ),
        users: state.users
          .map((user) => {
            if (user.role === "SUPER_ADMIN") {
              return user;
            }
            const assigned = user.assignedKindergartenIds.filter(
              (siteId) => siteId !== id,
            );
            const kindergartenId =
              user.kindergartenId === id
                ? (assigned[0] ?? null)
                : user.kindergartenId;
            return {
              ...user,
              kindergartenId,
              assignedKindergartenIds: assigned,
            };
          })
          .filter(
            (user) =>
              user.role === "SUPER_ADMIN" ||
              user.role === "DISTRICT_EDUCATION" ||
              Boolean(user.kindergartenId && user.assignedKindergartenIds.length),
          ),
      });
      return true;
    },
    [commit, currentUser, state],
  );

  const saveSubmission = useCallback(
    async (input: {
      kindergartenId: string;
      formCode: "FORM_1" | "FORM_2";
      form1Answers?: Record<string, string>;
      form2Plans?: Record<string, Record<string, string>>;
    }) => {
      if (!canAccessSite(currentUser, input.kindergartenId, state.kindergartens)) {
        return false;
      }
      if (!currentUser || !canSubmitForm(currentUser.role, input.formCode)) {
        return false;
      }
      try {
        await apiFetch("/platform/submissions", {
          method: "POST",
          body: JSON.stringify(input),
        });
        return true;
      } catch {
        return false;
      }
    },
    [currentUser, state],
  );

  const visibleState = useMemo((): PlatformState => {
    if (!currentUser) {
      return {
        ...state,
        kindergartens: [],
        users: [],
        children: [],
        submissions: [],
      };
    }
    if (currentUser.role === "SUPER_ADMIN") {
      return { ...state, submissions: state.submissions ?? [] };
    }
    const ids = new Set(userSiteIds(currentUser, state.kindergartens));
    return {
      ...state,
      kindergartens: state.kindergartens.filter((site) => ids.has(site.id)),
      users: state.users.filter((user) => user.id === currentUser.id),
      children: state.children.filter((child) => ids.has(child.kindergartenId)),
      submissions: (state.submissions ?? []).filter((row) =>
        ids.has(row.kindergartenId),
      ),
    };
  }, [currentUser, state]);

  const value = useMemo(
    () => ({
      ready,
      state: visibleState,
      currentUser,
      myKindergartens,
      login,
      logout,
      addKindergarten,
      addUserToKindergarten,
      updateKindergarten,
      deleteKindergarten,
      saveSubmission,
    }),
    [
      ready,
      visibleState,
      currentUser,
      myKindergartens,
      login,
      logout,
      addKindergarten,
      addUserToKindergarten,
      updateKindergarten,
      deleteKindergarten,
      saveSubmission,
    ],
  );

  return (
    <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>
  );
}

export function usePlatform() {
  const value = useContext(PlatformContext);
  if (!value) {
    throw new Error("usePlatform must be used within PlatformProvider");
  }
  return value;
}
