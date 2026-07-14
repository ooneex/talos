import agentsMd from "../AGENTS.md.txt";
import aiChatCreate from "./ai.chat.create.md.txt";
import aiMiddlewareCreate from "./ai.middleware.create.md.txt";
import aiToolCreate from "./ai.tool.create.md.txt";
import analyticsCreate from "./analytics.create.md.txt";
import cacheCreate from "./cache.create.md.txt";
import commandCreate from "./command.create.md.txt";
import commit from "./commit.md.txt";
import controllerCreate from "./controller.create.md.txt";
import cronCreate from "./cron.create.md.txt";
import databaseCreate from "./database.create.md.txt";
import databaseMigrate from "./database.migrate.md.txt";
import debug from "./debug.md.txt";
import deslop from "./deslop.md.txt";
import e2eCreate from "./e2e.create.md.txt";
import e2eRun from "./e2e.run.md.txt";
import entityCreate from "./entity.create.md.txt";
import eventCreate from "./event.create.md.txt";
import flagCreate from "./flag.create.md.txt";
import humanize from "./humanize.md.txt";
import issueFix from "./issue.fix.md.txt";
import issueFound from "./issue.found.md.txt";
import issuePlan from "./issue.plan.md.txt";
import loggerCreate from "./logger.create.md.txt";
import mailerCreate from "./mailer.create.md.txt";
import middlewareCreate from "./middleware.create.md.txt";
import migrationCreate from "./migration.create.md.txt";
import moduleCreate from "./module.create.md.txt";
import optimizeConventions from "./optimize.conventions.md.txt";
import optimize from "./optimize.md.txt";
import optimizeTesting from "./optimize.testing.md.txt";
import optimizeUiAiSlop from "./optimize.ui/ai-slop.md.txt";
import optimizeUiColorContrast from "./optimize.ui/color-contrast.md.txt";
import optimizeUiDataAndPerformance from "./optimize.ui/data-and-performance.md.txt";
import optimizeUiInteractionStates from "./optimize.ui/interaction-states.md.txt";
import optimizeUiLayoutSpacing from "./optimize.ui/layout-spacing.md.txt";
import optimizeUiMotion from "./optimize.ui/motion.md.txt";
import optimizeUiStateAndHooks from "./optimize.ui/state-and-hooks.md.txt";
import optimizeUiSurfaces from "./optimize.ui/surfaces.md.txt";
import optimizeUiTypography from "./optimize.ui/typography.md.txt";
import optimizeUi from "./optimize.ui.md.txt";
import permissionCreate from "./permission.create.md.txt";
import pr from "./pr.md.txt";
import queueCreate from "./queue.create.md.txt";
import rateLimitCreate from "./rate-limit.create.md.txt";
import repositoryCreate from "./repository.create.md.txt";
import review from "./review.md.txt";
import sdkCreate from "./sdk.create.md.txt";
import seedCreate from "./seed.create.md.txt";
import serviceCreate from "./service.create.md.txt";
import spaFeatureCreate from "./spa.feature.create.md.txt";
import storageCreate from "./storage.create.md.txt";
import talosArchitecture from "./talos.architecture.md.txt";
import ooCommands from "./talos.commands.md.txt";
import talosDesign from "./talos.design.md.txt";
import talosEnv from "./talos.env.md.txt";
import talosModule from "./talos.module.md.txt";
import talosPackages from "./talos.packages.md.txt";
import talosScaffold from "./talos.scaffold.md.txt";
import talosSpa from "./talos.spa.md.txt";
import translationCreate from "./translation.create.md.txt";
import translationTranslate from "./translation.translate.md.txt";
import vectorDatabaseCreate from "./vector-database.create.md.txt";
import workflowCreate from "./workflow.create.md.txt";
import workflowTransitionCreate from "./workflow.transition.create.md.txt";

export { agentsMd };

export type SkillTemplateType = string | { skill: string; references?: Record<string, string> };

export const skills: Record<string, SkillTemplateType> = {
  "talos.packages": talosPackages,
  "talos.commands": ooCommands,
  "talos.module": talosModule,
  "talos.architecture": talosArchitecture,
  "talos.design": talosDesign,
  "talos.spa": talosSpa,
  "talos.env": talosEnv,
  "talos.scaffold": talosScaffold,
  "module.create": moduleCreate,
  "ai.chat.create": aiChatCreate,
  "ai.tool.create": aiToolCreate,
  "ai.middleware.create": aiMiddlewareCreate,
  "analytics.create": analyticsCreate,
  "cache.create": cacheCreate,
  "command.create": commandCreate,
  "controller.create": controllerCreate,
  "cron.create": cronCreate,
  "database.create": databaseCreate,
  "database.migrate": databaseMigrate,
  "e2e.create": e2eCreate,
  "e2e.run": e2eRun,
  "entity.create": entityCreate,
  "event.create": eventCreate,
  "flag.create": flagCreate,
  "logger.create": loggerCreate,
  "mailer.create": mailerCreate,
  "middleware.create": middlewareCreate,
  "migration.create": migrationCreate,
  "permission.create": permissionCreate,
  "queue.create": queueCreate,
  "rate-limit.create": rateLimitCreate,
  "repository.create": repositoryCreate,
  "sdk.create": sdkCreate,
  "seed.create": seedCreate,
  "service.create": serviceCreate,
  "spa.feature.create": spaFeatureCreate,
  "storage.create": storageCreate,
  "translation.create": translationCreate,
  "translation.translate": translationTranslate,
  "vector-database.create": vectorDatabaseCreate,
  "workflow.create": workflowCreate,
  "workflow.transition.create": workflowTransitionCreate,
  "issue.fix": issueFix,
  "issue.found": issueFound,
  "issue.plan": issuePlan,
  commit: commit,
  pr: pr,
  review: review,
  debug: debug,
  deslop: deslop,
  humanize: humanize,
  optimize: optimize,
  "optimize.conventions": optimizeConventions,
  "optimize.testing": optimizeTesting,
  "optimize.ui": {
    skill: optimizeUi,
    references: {
      "ai-slop.md": optimizeUiAiSlop,
      "interaction-states.md": optimizeUiInteractionStates,
      "motion.md": optimizeUiMotion,
      "typography.md": optimizeUiTypography,
      "color-contrast.md": optimizeUiColorContrast,
      "surfaces.md": optimizeUiSurfaces,
      "layout-spacing.md": optimizeUiLayoutSpacing,
      "state-and-hooks.md": optimizeUiStateAndHooks,
      "data-and-performance.md": optimizeUiDataAndPerformance,
    },
  },
};
