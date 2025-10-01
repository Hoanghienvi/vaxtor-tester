const fs = require("fs");
const path = require("path");

// Thư mục chứa ảnh fake
const IMAGE_DIR = path.join(__dirname, "images");

// Tạo thư mục nếu chưa có
if (!fs.existsSync(IMAGE_DIR)) {
  fs.mkdirSync(IMAGE_DIR);
}

// Hàm tạo ảnh giả
function createDummyImage(filename) {
  const filepath = path.join(IMAGE_DIR, filename);
  const dummyData = Buffer.from(
    "FFD8FFE000104A46494600010101006000600000FFDB00430001010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101FFDA000C03010002110311003F00D2CF20FFD9",
    "hex"
  );
  fs.writeFileSync(filepath, dummyData);
  return filepath;
}

// Fake event
const event = {
  plate: "60TEST999",
  confidence: 99,
  country: "VNM",
  processingtime: 45.5,
  direction: 0,
  cameraid: "CAM01",
  date: new Date().toISOString(),
};

// Tạo ảnh kèm event
const plateImg = createDummyImage(`${event.plate}_plate.jpg`);
const envImg = createDummyImage(`${event.plate}_env.jpg`);

console.log("✅ Fake images created:");
console.log("📸 Plate image:", plateImg);
console.log("🌆 Env image:", envImg);
