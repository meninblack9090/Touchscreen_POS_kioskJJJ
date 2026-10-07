const fs = require("node:fs/promises");
const path = require("node:path");
const vm = require("node:vm");
const { webcrypto } = require("node:crypto");
const prettier = require("prettier");

const root = path.resolve(__dirname, "..");

async function validateReferences(html) {
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    const reference = match[1];
    if (/^(https?:|data:|#)/.test(reference)) continue;
    const file = path.resolve(root, reference);
    if (!file.startsWith(root + path.sep))
      throw new Error(`Invalid asset path: ${reference}`);
    await fs.access(file);
  }
}

async function build() {
  const html = await fs.readFile(path.join(root, "index.html"), "utf8");
  await prettier.format(html, { parser: "html" });
  await validateReferences(html);
  const css = await fs.readFile(path.join(root, "css/styles.css"), "utf8");
  await prettier.format(css, { parser: "css" });
  const context = vm.createContext({ window: {}, crypto: webcrypto });
  for (const match of html.matchAll(/<script\s+defer\s+src="([^"]+)"/g)) {
    const filename = match[1];
    const source = await fs.readFile(path.join(root, filename), "utf8");
    const script = new vm.Script(source, { filename });
    if (filename !== "js/app.js") script.runInContext(context);
  }
  const kiosk = context.window.Kiosk;
  const state = kiosk.createState();
  for (const product of kiosk.products) state.cart.set(product.id, 1);
  for (const method of kiosk.paymentMethods) {
    state.method = method;
    state.receipt = null;
    state.screen = 4;
    kiosk.completePayment(state, kiosk.getOrder(state.cart).total);
    for (let screen = 1; screen <= 6; screen++) {
      state.screen = screen;
      const markup = kiosk.renderScreen(state);
      await prettier.format(markup, { parser: "html" });
      await validateReferences(markup);
    }
  }
  const output = path.join(root, "dist");
  await fs.mkdir(output, { recursive: true });
  await fs.copyFile(
    path.join(root, "index.html"),
    path.join(output, "index.html"),
  );
  for (const directory of ["css", "js", "assets"]) {
    await fs.cp(path.join(root, directory), path.join(output, directory), {
      recursive: true,
    });
  }
  console.log(
    "Build passed: JavaScript syntax, CSS/HTML parsing, script dependencies and asset paths checked. Static site written to dist/.",
  );
}

build().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
