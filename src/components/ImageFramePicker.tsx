"use client";

import { IMAGE_FRAMES, type ImageFrameKey } from "@/lib/slides/styles";

export default function ImageFramePicker({ value, onChange }: { value?: ImageFrameKey; onChange: (frame?: ImageFrameKey) => void }) {
  return <fieldset className="frame-picker"><legend>Image frame</legend><div>
    <button type="button" className={!value ? "is-selected" : ""} aria-pressed={!value} onClick={() => onChange(undefined)}><span className="frame-none">None</span></button>
    {IMAGE_FRAMES.map((frame) => <button type="button" className={value === frame.key ? "is-selected" : ""} aria-pressed={value === frame.key} title={frame.label} onClick={() => onChange(frame.key)} key={frame.key}><span style={{ WebkitMaskImage: `url("${frame.asset}")`, maskImage: `url("${frame.asset}")` }} /></button>)}
  </div></fieldset>;
}
