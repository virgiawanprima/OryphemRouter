export default {
  id: "microsoft-designer-web",
  alias: "msd",
  display: {
    name: "Microsoft Designer Web",
    icon: "image",
    color: "#0067B8",
    textIcon: "MD",
    website: "https://designer.microsoft.com",
  },
  category: "webCookie",
  authType: "apikey",
  transport: {
    format: "openai",
    executor: "microsoft-designer-web",
    baseUrl: "https://designerapp.officeapps.live.com/designerapp/DallE.ashx?action=GetDallEImagesCogSci",
    auth: {
      combined: true,
      header: "Cookie",
      scheme: "raw",
    },
  },
  models: [
    {
      id: "dall-e-3",
      name: "DALL-E 3",
      kind: "image",
    },
  ],
};
