const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

async function main() {
  const source = path.join(__dirname, "..", "src", "assets", "lodex-logo.png");
  const destination = path.join(__dirname, "..", "build", "icon.png");
  await sharp(fs.readFileSync(source)).resize(512, 512).png().toFile(destination);
  console.log(destination);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
