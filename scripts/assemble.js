#!/usr/bin/env node
// A video from the frames of scripts/render-frames.js (stage and video, V5): one or more frame
// folders, one after the other, into one H.264 file, with ffmpeg. Development only, like
// Playwright and resvg: the kit makes frames; this only writes ffmpeg's command and runs it when
// ffmpeg is installed.
//
//   node scripts/assemble.js <dir…> -o video.mp4 [--burn] [--crf 18]
//
// Each dir is what render-frames.js wrote (frames/NNNNNN.png and timeline.json); all must share a
// size and an fps. --burn draws the captions of their timeline.json under the picture (from the
// times they were on screen, one clip after another), above the platforms' bottom band: for a
// recording whose frames have no caption layer of their own, or a second language. The captions
// of all the clips are also written beside the video as <video>.srt.
//
// Exits 0 when the video was written, 1 when the folders do not fit together or ffmpeg failed,
// 2 when ffmpeg is not installed: it prints the command then, never a pass.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { toSrt } from './render-frames.js';

const CAPTION_PX = { 1080: 56, 1920: 52 }; // the frame's caption sizes by width (docs: The frame)

// The clips: each folder's timeline.json, checked to fit with the others.
export function readClips(dirs) {
  const clips = dirs.map((dir) => {
    const file = join(dir, 'timeline.json');
    if (!existsSync(file)) throw new Error(`${dir}: no timeline.json (made by scripts/render-frames.js)`);
    const t = JSON.parse(readFileSync(file, 'utf8'));
    return { dir, fps: t.fps, size: t.size, frames: t.frames, captions: t.captions ?? [] };
  });
  const [first] = clips;
  for (const c of clips) {
    if (c.fps !== first.fps) throw new Error(`${c.dir}: ${c.fps} fps, ${first.dir}: ${first.fps}`);
    if (c.size.width !== first.size.width || c.size.height !== first.size.height) throw new Error(`${c.dir}: ${c.size.width} × ${c.size.height}, ${first.dir}: ${first.size.width} × ${first.size.height}`);
  }
  return clips;
}

// Every clip's captions on the video's clock: each clip starts where the one before ended.
export function joinedCaptions(clips) {
  const out = [];
  let start = 0;
  for (const c of clips) {
    for (const cap of c.captions) out.push({ ...cap, from: start + cap.from, to: start + cap.to });
    start += (c.frames * 1000) / c.fps;
  }
  return out;
}

// ffmpeg's arguments. Subtitles go through libass, whose sizes are in a 288-line space: the
// caption's pixels scaled to it, and a bottom margin past the platforms' band (25 %).
export function ffmpegArgs(clips, { out, crf = 18, srt = null }) {
  const { width, height } = clips[0].size;
  const inputs = clips.flatMap((c) => ['-framerate', String(c.fps), '-i', join(c.dir, 'frames', '%06d.png')]);
  const joined = clips.length > 1 ? `${clips.map((_, k) => `[${k}:v]`).join('')}concat=n=${clips.length}:v=1:a=0` : '[0:v]null';
  const size = Math.round(((CAPTION_PX[width] ?? 52) * 288) / height * 10) / 10;
  const style = `FontSize=${size},MarginV=${Math.round(288 * 0.27)},Outline=1.5,Shadow=0,BorderStyle=1`;
  const burn = srt ? `,subtitles=${srt}:force_style='${style}'` : '';
  return ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-filter_complex', `${joined}${burn},format=yuv420p[v]`, '-map', '[v]', '-c:v', 'libx264', '-crf', String(crf), '-preset', 'medium', '-movflags', '+faststart', out];
}

const quote = (a) => (/^[\w@%+=:,./-]+$/.test(a) ? a : `'${a.replace(/'/g, "'\\''")}'`);
const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

function parse(argv) {
  const args = { dirs: [], out: null, burn: false, crf: 18 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '-o') args.out = resolve(argv[++i]);
    else if (a === '--burn') args.burn = true;
    else if (a === '--crf') args.crf = Number(argv[++i]);
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else args.dirs.push(resolve(a));
  }
  if (!args.dirs.length || !args.out) throw new Error('usage: node scripts/assemble.js <dir…> -o video.mp4 [--burn] [--crf 18]');
  return args;
}

function main() {
  const args = parse(process.argv.slice(2));
  const clips = readClips(args.dirs);
  const captions = joinedCaptions(clips);
  const srtFile = args.out.replace(/\.[^./]+$/, '') + '.srt';
  writeFileSync(srtFile, toSrt(captions));
  // libass reads the subtitles from a path inside a filter: a plain name in a folder of its own,
  // where ffmpeg runs, so no path needs escaping.
  const work = args.burn ? mkdtempSync(join(tmpdir(), 'assemble-')) : null;
  if (work) writeFileSync(join(work, 'captions.srt'), toSrt(captions));
  const ffArgs = ffmpegArgs(clips, { out: args.out, crf: args.crf, srt: work ? 'captions.srt' : null });
  const line = `${work ? `cd ${quote(work)} && ` : ''}ffmpeg ${ffArgs.map(quote).join(' ')}`;
  try {
    if (!hasFfmpeg()) {
      console.log(`SKIPPED: ffmpeg is not installed. The command:\n${line}`);
      return 2;
    }
    const r = spawnSync('ffmpeg', ffArgs, { cwd: work ?? process.cwd(), stdio: 'inherit' });
    if (r.status !== 0) {
      console.log(`✖ ffmpeg failed (${r.status}). The command:\n${line}`);
      return 1;
    }
    const total = clips.reduce((s, c) => s + c.frames / c.fps, 0);
    console.log(`✔ ${args.out}: ${clips.length} clip${clips.length > 1 ? 's' : ''}, ${total.toFixed(2)} s, ${clips[0].size.width} × ${clips[0].size.height} at ${clips[0].fps} fps; captions in ${srtFile}`);
    return 0;
  } finally {
    if (work) rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exit(main());
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
