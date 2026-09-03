export default {
  id: "gitlab-duo",
  alias: "gld",
  display: {
    name: "GitLab Duo",
    icon: "code",
    color: "#FC6D26",
    textIcon: "GD",
    website: "https://gitlab.com",
  },
  category: "oauth",
  authType: "oauth",
  hasOAuth: true,
  transport: {
    format: "openai",
    executor: "gitlab",
    baseUrl: "https://gitlab.com/api/v4/code_suggestions/completions",
    auth: {
      combined: true,
      header: "Authorization",
      scheme: "bearer",
    },
  },
  oauth: {
    clientIdEnv: "GITLAB_DUO_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITLAB_DUO_OAUTH_CLIENT_SECRET",
    clientId: "",
    clientSecret: "",
    tokenUrl: "https://gitlab.com/oauth/token",
    authorizeUrl: "https://gitlab.com/oauth/authorize",
  },
  models: [
    {
      id: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6 (GitLab Duo)",
      contextLength: 128000,
    },
    {
      id: "claude-haiku-4-5",
      name: "Claude Haiku 4.5 (GitLab Duo)",
      contextLength: 128000,
    },
  ],
};
