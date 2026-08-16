import express from "express";
import { exec } from "child_process";
import { promisify } from "util";
import fs from "fs/promises";
import path from "path";
import os from "os";

const execAsync = promisify(exec);
const app = express();
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/cut-clips", async (req, res) => {
  const { videoUrl, clips } = req.body;
  if (!videoUrl || !Array.isArray(clips)) {
    return res.status(400).json({ error: "videoUrl and clips[] are required" });
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "flukly-"));
  const inputPath = path.join(tmpDir, "input.mp4");

  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error(`Failed to download video: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.writeFile(inputPath, buffer);

    const results = [];
    for (const clip of clips) {
      const { id, start_time, end_time } = clip;
      const outputPath = path.join(tmpDir, `clip-${id}.mp4`);
      const duration = end_time - start_time;

      await execAsync(
        `ffmpeg -y -i "${inputPath}" -ss ${start_time} -t ${duration} -c copy "${outputPath}"`
      );

      const clipBuffer = await fs.readFile(outputPath);
      results.push({ id, buffer: clipBuffer.toString("base64") });
    }

    res.json({ clips: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`FluKly Clipper running on port ${PORT}`));
