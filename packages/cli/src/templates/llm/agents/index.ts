import apiIssueFixer from "./api.issue.fixer.md.txt";
import apiIssueFounder from "./api.issue.founder.md.txt";
import codeOptimizer from "./code.optimizer.md.txt";
import conventionReviewer from "./convention.reviewer.md.txt";
import designIssueFixer from "./design.issue.fixer.md.txt";
import designIssueFounder from "./design.issue.founder.md.txt";
import microserviceIssueFixer from "./microservice.issue.fixer.md.txt";
import microserviceIssueFounder from "./microservice.issue.founder.md.txt";
import moduleIssueFixer from "./module.issue.fixer.md.txt";
import moduleIssueFounder from "./module.issue.founder.md.txt";
import spaIssueFixer from "./spa.issue.fixer.md.txt";
import spaIssueFounder from "./spa.issue.founder.md.txt";
import testAuthor from "./test.author.md.txt";
import translationExtractor from "./translation.extractor.md.txt";
import translationTranslator from "./translation.translator.md.txt";

export const agents: Record<string, string> = {
  "api-issue-fixer": apiIssueFixer,
  "api-issue-founder": apiIssueFounder,
  "code-optimizer": codeOptimizer,
  "convention-reviewer": conventionReviewer,
  "design-issue-fixer": designIssueFixer,
  "design-issue-founder": designIssueFounder,
  "microservice-issue-fixer": microserviceIssueFixer,
  "microservice-issue-founder": microserviceIssueFounder,
  "module-issue-fixer": moduleIssueFixer,
  "module-issue-founder": moduleIssueFounder,
  "spa-issue-fixer": spaIssueFixer,
  "spa-issue-founder": spaIssueFounder,
  "test-author": testAuthor,
  "translation-extractor": translationExtractor,
  "translation-translator": translationTranslator,
};
