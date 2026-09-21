import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formatDate, formatDateTime, relativeTime } from "../lib/format";
import { getDictionary, template } from "../lib/i18n/get-dictionary";
import { LOCALE_COOKIE } from "../lib/i18n/locales";
import { renderTerms } from "../lib/i18n/terms";
import EditArticlePage from "./articles/[articleId]/edit/page";
import ArticlePage from "./articles/[articleId]/page";
import ImportPage from "./brains/[brainId]/import/page";
import MaintenancePage from "./brains/[brainId]/maintenance/page";
import BrainPage from "./brains/[brainId]/page";
import TasksPage from "./brains/[brainId]/tasks/page";
import WritesPage from "./brains/[brainId]/writes/page";
import ConnectionsPage, { generateMetadata as connectionsMetadata } from "./connections/page";
import InvitePage, { generateMetadata as inviteMetadata } from "./invite/[token]/page";
import TaskPage from "./tasks/[taskId]/page";
import TeamInvitePage, { generateMetadata as teamInviteMetadata } from "./team-invite/[token]/page";
import TeamPage, { generateMetadata as teamMetadata } from "./teams/[teamId]/page";
import TeamsPage, { generateMetadata as teamsMetadata } from "./teams/page";
import WritePage from "./writes/[writeId]/page";

const mocks = vi.hoisted(() => ({ api: vi.fn(), locale: "en", empty: false }));
vi.mock("../lib/api", () => ({
  api: mocks.api,
  hasSession: async () => true,
  workspaceContext: async () => ({
    teams: [{ id: "team-one", name: "Untranslated team", slug: "team-slug", role: "owner" }],
    workspaces: [
      {
        id: "workspace-one",
        teamId: "team-one",
        name: "Untranslated workspace",
        slug: "workspace-slug",
        mcpUrl: "https://example.test/mcp/workspace/workspace-one",
      },
    ],
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => new Map([[LOCALE_COOKIE, { value: mocks.locale }]]),
  headers: async () => new Headers(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => "/brains/brain-one",
}));

const createdAt = "2026-09-01T12:00:00Z";
const article = {
  id: "article-one",
  brainId: "brain-one",
  title: "Untranslated article title",
  slug: "unchanged-slug",
  summary: "Untranslated summary",
  body: "Untranslated **body**",
  kind: "canonical",
  currentVersion: 3,
  freshness: "review_due",
  keywords: ["Untranslated keyword"],
  updatedAt: createdAt,
  provenance: { changeSummary: "Untranslated change", createdAt, clientId: null },
};
const write = {
  id: "write-one",
  brainId: "brain-one",
  title: "Untranslated proposal",
  summary: "Untranslated proposal summary",
  changeSummary: "Untranslated change",
  status: "conflicted",
  operation: "update",
  potentialConflicts: [{}],
  createdAt,
};
const task = {
  id: "task-one",
  brainId: "brain-one",
  title: "Untranslated task",
  brief: "Untranslated brief",
  status: "claimed",
  priority: 2,
  claimedBy: "agent-one",
  leaseExpiresAt: null,
};
const brainParams = { params: Promise.resolve({ brainId: "brain-one" }) };
const articleParams = { params: Promise.resolve({ articleId: "article-one" }) };
const taskParams = { params: Promise.resolve({ taskId: "task-one" }) };
const writeParams = { params: Promise.resolve({ writeId: "write-one" }) };
const escaped = (value: string) => renderToStaticMarkup(value);

beforeEach(() => {
  mocks.empty = false;
  mocks.api.mockReset();
  mocks.api.mockImplementation(async (path: string) => {
    if (path === "/api/v1/connections")
      return mocks.empty
        ? []
        : [
            {
              grantId: "grant-one",
              clientId: "client-one",
              clientName: "Untranslated client",
              scopes: ["brains:read"],
            },
          ];
    if (path === "/api/v1/teams/team-one/members")
      return [
        {
          userId: "owner-one",
          email: "owner@example.test",
          displayName: "Untranslated owner",
          role: "owner",
          createdAt,
        },
        {
          userId: "admin-one",
          email: "admin@example.test",
          displayName: "Untranslated admin",
          role: "admin",
          createdAt,
        },
        {
          userId: "member-one",
          email: "member@example.test",
          displayName: "Untranslated member",
          role: "member",
          createdAt,
        },
      ];
    if (path === "/api/v1/teams/team-one/invitations")
      return mocks.empty
        ? []
        : [
            {
              id: "team-invitation-one",
              email: "invited@example.test",
              role: "member",
              expiresAt: createdAt,
            },
          ];
    if (path.includes("/history"))
      return [{ ...article.provenance, id: "version-one", version: 3 }];
    if (path.includes("/invitations"))
      return [
        {
          id: "invitation-one",
          email: "reader@example.test",
          role: "editor",
          expiresAt: createdAt,
          createdAt,
          awaitingApproval: true,
          proposedByClient: null,
        },
      ];
    if (path.includes("/maintenance"))
      return mocks.empty
        ? []
        : [
            {
              id: "candidate-one",
              kind: "potential_conflict",
              articleIds: [article.id],
              detail: {},
            },
          ];
    if (path.includes("/comments"))
      return mocks.empty
        ? []
        : [{ id: "comment-one", body: "Untranslated comment", actorId: "actor-one", createdAt }];
    if (path.includes("/review"))
      return { write, currentBody: article.body, candidateBody: "Untranslated candidate" };
    if (path.endsWith("/writes")) return mocks.empty ? [] : [write];
    if (path.endsWith("/tasks")) return mocks.empty ? [] : [task];
    if (path.startsWith("/api/v1/articles/")) return article;
    if (path.startsWith("/api/v1/tasks/")) return task;
    if (path.startsWith("/api/v1/brains/"))
      return {
        brain: { id: "brain-one", name: "Untranslated brain", description: "", instructions: "" },
        role: "owner",
        articleTotal: mocks.empty ? 0 : 51,
        routingIndex: mocks.empty ? [] : [article],
      };
    throw new Error(`Unexpected API path: ${path}`);
  });
});

describe("content page localization", () => {
  it.each(["en", "tr", "zh"] as const)(
    "passes the %s request dictionary through all four areas and their forms",
    async (locale) => {
      mocks.locale = locale;
      const dict = getDictionary(locale);
      const brain = renderToStaticMarkup(
        await BrainPage({ ...brainParams, searchParams: Promise.resolve({}) }),
      );
      expect(brain).toContain(escaped(dict.brains.currentCanon));
      expect(brain).toContain(escaped(dict.brains.createInvite));
      expect(brain).toContain(escaped(dict.brains.deleteBrain));
      expect(brain).toContain(escaped(dict.brains.navMaintenance));
      expect(brain).toContain(escaped(dict.common.next));
      expect(brain).toContain(dict.articles.freshnessReviewDue);
      expect(brain).toContain("Untranslated article title");
      expect(brain).toContain(
        escaped(
          template(dict.brains.invitationProposed, {
            role: dict.brains.roleEditor,
            client: dict.brains.anAgent,
            time: relativeTime(createdAt, locale),
          }),
        ),
      );
      expect(brain).toContain(renderToStaticMarkup(renderTerms(dict.brains.brain)));

      const imported = renderToStaticMarkup(await ImportPage(brainParams));
      expect(imported).toContain(dict.brains.importTitle);
      expect(imported).toContain(renderToStaticMarkup(renderTerms(dict.brains.importArchive)));
      expect(imported).toContain(dict.brains.chooseArchive);
      expect(imported).not.toContain("[[");

      const maintenance = renderToStaticMarkup(await MaintenancePage(brainParams));
      expect(maintenance).toContain(dict.brains.maintenanceTitle);
      expect(maintenance).toContain(dict.brains.runScan);
      expect(maintenance).toContain(dict.brains.candidatePotentialConflict);
      expect(maintenance).toContain(template(dict.brains.articlesOne, { count: 1 }));

      const articleHtml = renderToStaticMarkup(await ArticlePage(articleParams));
      expect(articleHtml).toContain(dict.articles.provenance);
      expect(articleHtml).toContain(escaped(dict.articles.stageAnEdit));
      expect(articleHtml).toContain(formatDateTime(createdAt, locale));
      expect(articleHtml).toContain(relativeTime(createdAt, locale));
      expect(articleHtml).toContain("Untranslated <strong>body</strong>");

      const edit = renderToStaticMarkup(await EditArticlePage(articleParams));
      expect(edit).toContain(template(dict.articles.editTitle, { title: article.title }));
      expect(edit).toContain(dict.articles.summaryPlaceholder);
      expect(edit).toContain(escaped(dict.articles.stageEdit));
      expect(edit).toContain(renderToStaticMarkup(renderTerms(dict.articles.stageOnly)));
      expect(edit).toContain(renderToStaticMarkup(renderTerms(dict.articles.markdownBody)));
      expect(edit).not.toContain("[[");

      const writes = renderToStaticMarkup(await WritesPage(brainParams));
      expect(writes).toContain(escaped(dict.writes.title));
      expect(writes).toContain(dict.writes.statusConflicted);
      expect(writes).toContain(dict.writes.operationUpdate);
      expect(writes).toContain(formatDateTime(createdAt, locale));
      const review = renderToStaticMarkup(await WritePage(writeParams));
      expect(review).toContain(escaped(dict.writes.overridePromote));
      expect(review).toContain(template(dict.writes.conflictsOne, { count: 1 }));
      expect(review).toContain(renderToStaticMarkup(renderTerms(dict.writes.currentCanon)));
      expect(review).not.toContain("[[");
      expect(review).toContain("Untranslated candidate");

      const tasks = renderToStaticMarkup(await TasksPage(brainParams));
      expect(tasks).toContain(dict.tasks.title);
      expect(tasks).toContain(dict.tasks.newTask);
      expect(tasks).toContain(dict.tasks.createTask);
      expect(tasks).toContain(dict.tasks.statusClaimed);
      expect(tasks).toContain(template(dict.tasks.priorityValue, { priority: 2 }));
      const detail = renderToStaticMarkup(await TaskPage(taskParams));
      expect(detail).toContain(dict.tasks.comments);
      expect(detail).toContain(dict.tasks.addComment);
      expect(detail).toContain(formatDateTime(createdAt, locale));
      expect(detail).toContain(relativeTime(createdAt, locale));
      expect(detail).toContain("Untranslated comment");
    },
  );

  it.each(["en", "tr", "zh"] as const)(
    "passes the %s request dictionary through teams, invitations and connections",
    async (locale) => {
      mocks.locale = locale;
      const dict = getDictionary(locale);
      const strings = dict.teams;
      const teams = renderToStaticMarkup(await TeamsPage());
      for (const value of [
        strings.title,
        strings.kicker,
        strings.description,
        strings.teamName,
        strings.teamPlaceholder,
        strings.createTeam,
        strings.manage,
        strings.roleOwner,
        strings.copyUrl,
        dict.common.copied,
        dict.common.copyFailed,
      ]) {
        expect(teams).toContain(escaped(value));
      }
      expect(teams).toContain(renderToStaticMarkup(renderTerms(strings.workspaceMcpUrl)));
      expect(teams).toContain("Untranslated team");
      expect(teams).toContain("Untranslated workspace");
      expect(teams).toContain("https://example.test/mcp/workspace/workspace-one");
      expect(teams).not.toContain("[[");

      const team = renderToStaticMarkup(
        await TeamPage({ params: Promise.resolve({ teamId: "team-one" }) }),
      );
      for (const value of [
        strings.workspaces,
        strings.members,
        strings.teamDescription,
        strings.createWorkspace,
        strings.workspaceName,
        strings.workspacePlaceholder,
        strings.deleteTeamTitle,
        strings.deleteTeamDescription,
        strings.deleteTeam,
        strings.rename,
        strings.delete,
        strings.sendInvitation,
        strings.email,
        strings.role,
        strings.roleOwner,
        strings.roleAdmin,
        strings.roleMember,
        strings.makeMember,
        strings.makeAdmin,
        strings.remove,
        strings.pendingInvitations,
        strings.resend,
        strings.revoke,
      ]) {
        expect(team).toContain(escaped(value));
      }
      expect(team).toContain(escaped(template(strings.teamKicker, { role: strings.roleOwner })));
      expect(team).toContain(
        escaped(template(strings.invitationExpires, { date: formatDate(createdAt, locale) })),
      );
      expect(team).toContain(`aria-label="${strings.workspaces}"`);
      expect(team).toContain("Untranslated owner");
      expect(team).toContain("invited@example.test");
      expect(team).not.toContain("[[");

      const params = { params: Promise.resolve({ token: "unchanged-token" }) };
      const teamInvite = renderToStaticMarkup(await TeamInvitePage(params));
      for (const value of [
        strings.teamInvitation,
        strings.joinTeamTitle,
        strings.joinTeamDescription,
        strings.loadingInvitation,
      ])
        expect(teamInvite).toContain(escaped(value));
      const invite = renderToStaticMarkup(await InvitePage(params));
      for (const value of [
        strings.brainInvitation,
        strings.joinBrainTitle,
        strings.joinBrainDescription,
        strings.loadingInvitation,
      ])
        expect(invite).toContain(escaped(value));
      expect(teamInvite).not.toContain("[[");
      expect(invite).not.toContain("[[");

      const connections = renderToStaticMarkup(await ConnectionsPage());
      for (const value of [
        dict.connections.title,
        dict.connections.kicker,
        dict.connections.description,
        dict.connections.revoke,
      ])
        expect(connections).toContain(escaped(value));
      expect(connections).toContain(`aria-label="${dict.connections.grantedScopes}"`);
      expect(connections).toContain("Untranslated client");
      expect(connections).toContain("client-one");
      expect(connections).toContain("brains:read");
      expect(await teamsMetadata()).toEqual({ title: strings.title });
      expect(await teamMetadata()).toEqual({ title: strings.title });
      expect(await teamInviteMetadata()).toEqual({ title: strings.teamInvitation });
      expect(await inviteMetadata()).toEqual({ title: strings.brainInvitation });
      expect(await connectionsMetadata()).toEqual({ title: dict.connections.title });
    },
  );

  it.each(["en", "tr", "zh"] as const)("renders %s empty states", async (locale) => {
    mocks.locale = locale;
    mocks.empty = true;
    const dict = getDictionary(locale);
    const pages = [
      [
        await BrainPage({ ...brainParams, searchParams: Promise.resolve({}) }),
        dict.brains.emptyIndex,
      ],
      [await WritesPage(brainParams), dict.writes.noWritesTitle],
      [await TasksPage(brainParams), dict.tasks.noTasks],
      [await MaintenancePage(brainParams), dict.brains.noCandidates],
      [await TaskPage(taskParams), dict.tasks.noComments],
      [
        await TeamPage({ params: Promise.resolve({ teamId: "team-one" }) }),
        dict.teams.noInvitations,
      ],
      [await ConnectionsPage(), dict.connections.noConnectionsTitle],
      [await ConnectionsPage(), dict.connections.noConnectionsBody],
    ] as const;
    for (const [page, label] of pages) expect(renderToStaticMarkup(page)).toContain(escaped(label));
  });
});
