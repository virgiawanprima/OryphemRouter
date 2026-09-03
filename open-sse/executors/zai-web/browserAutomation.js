import {
  browserModelName,
  getZaiModelCapabilities
} from "./protocol.js";
async function runStage(name, action) {
  try {
    await action();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${name}: ${message}`);
  }
}
async function selectZaiBrowserModel(page, modelName) {
  const selector = page.locator('[aria-label="Select a model"]').first();
  await selector.waitFor({ state: "visible", timeout: 1e4 });
  if ((await selector.innerText()).includes(modelName)) return;
  await selector.evaluate((element) => element.click());
  const menu = page.locator('[role="menu"]').filter({ hasText: modelName }).first();
  await menu.waitFor({ state: "visible", timeout: 5e3 });
  const modelButton = menu.locator("button").filter({ hasText: modelName }).first();
  await modelButton.evaluate((element) => element.click());
  await page.locator('[aria-label="Select a model"]').filter({ hasText: modelName }).first().waitFor({ state: "visible", timeout: 5e3 });
}
async function setZaiBrowserToggle(page, label, dataAttribute, enabled) {
  const wrapper = page.locator(`[aria-label^="${label} "]`).first();
  await wrapper.waitFor({ state: "visible", timeout: 5e3 });
  const button = wrapper.locator(`button[${dataAttribute}]`).first();
  const current = await button.getAttribute(dataAttribute) === "true";
  if (current !== enabled) await button.click({ timeout: 5e3 });
}
async function setZaiBrowserWebSearch(page, enabled) {
  const labelledWrapper = page.locator('[aria-label^="Web search "]').first();
  if (await labelledWrapper.count() > 0) {
    await setZaiBrowserToggle(page, "Web search", "data-selected", enabled);
    return;
  }
  const button = page.locator("#upload-file-button").locator("xpath=../../../following-sibling::div//button[@data-active]").first();
  await button.waitFor({ state: "visible", timeout: 5e3 });
  const current = await button.getAttribute("data-active") === "true";
  if (current !== enabled) {
    await button.click({ timeout: 5e3 });
    await page.keyboard.press("Escape");
  }
}
async function selectZaiBrowserEffortLevel(menu, effort) {
  const effortButton = menu.locator("button").filter({
    hasText: effort === "high" ? "High" : "Max"
  });
  if (await effortButton.getAttribute("data-selected") === "true") return;
  await runStage(
    `select ${effort}`,
    () => effortButton.evaluate((element) => element.click())
  );
}
async function configureZaiBrowserEffort(page, config) {
  const trigger = page.locator("[data-dropdown-menu-trigger]").filter({ hasText: "Deep Think" }).first();
  await trigger.waitFor({ state: "visible", timeout: 1e4 });
  await runStage(
    "open menu",
    () => trigger.evaluate((element) => element.click())
  );
  const menu = page.locator('[role="menu"]').filter({ hasText: "Deep Think" }).first();
  await menu.waitFor({ state: "visible", timeout: 5e3 });
  const toggle = menu.locator('[role="switch"]').first();
  const checked = await toggle.getAttribute("aria-checked") === "true";
  if (checked !== config.enabled) {
    await runStage(
      config.enabled ? "enable toggle" : "disable toggle",
      () => toggle.click({ timeout: 5e3 })
    );
  }
  if (config.enabled) {
    await selectZaiBrowserEffortLevel(menu, config.effort);
  }
  if (await menu.isVisible()) {
    await page.keyboard.press("Escape");
  }
}
async function configureZaiBrowserRequest(page, input) {
  await runStage(
    "model selection",
    () => selectZaiBrowserModel(page, browserModelName(input.modelId))
  );
  if (input.thinking.effortSupported) {
    await runStage("Deep Think effort", () => configureZaiBrowserEffort(page, input.thinking));
  } else if (input.thinking.supported) {
    await runStage(
      "Deep Think toggle",
      () => setZaiBrowserToggle(page, "Deep think", "data-autothink", input.thinking.enabled)
    );
  }
  const capabilities = getZaiModelCapabilities(input.modelId);
  if (capabilities.webSearch) {
    await runStage(
      "web search toggle",
      () => setZaiBrowserWebSearch(page, input.vlm.webSearchEnabled)
    );
  }
  if (capabilities.vlmTools) {
    await runStage(
      "tools toggle",
      () => setZaiBrowserToggle(page, "Tools", "data-selected", input.vlm.toolsEnabled)
    );
  }
}
export {
  configureZaiBrowserRequest
};
