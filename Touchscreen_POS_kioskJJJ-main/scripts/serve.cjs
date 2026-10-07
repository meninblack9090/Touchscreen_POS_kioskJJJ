const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const types = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
};

http
  .createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(
        new URL(request.url, "http://localhost").pathname,
      );
      const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
      const filePath = path.resolve(root, relativePath);
      const isPublic =
        relativePath === "index.html" ||
        /^(css|js|assets)\//.test(relativePath);
      if (!isPublic || !filePath.startsWith(root + path.sep)) {
        response.writeHead(404).end("Not found");
        return;
      }
      const content = await fs.readFile(filePath);
      response.writeHead(200, {
        "Content-Type":
          (types[path.extname(filePath)] || "application/octet-stream") +
          "; charset=utf-8",
      });
      response.end(content);
    } catch {
      response.writeHead(404).end("Not found");
    }
  })
  .on("error", (error) => {
    console.error(
      error.code === "EADDRINUSE"
        ? "Port 4173 is already in use. Stop the other server or open http://localhost:4173."
        : error.message,
    );
    process.exitCode = 1;
  })
  .listen(4173, "127.0.0.1", () => {
    console.log("Kiosk running at http://localhost:4173");
    console.log("Press Ctrl+C to stop the server.");
  });
