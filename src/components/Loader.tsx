import React from "react";
export default function Loader({label="Loading…",overlay=false}:{label?:string;overlay?:boolean}){return <div className={overlay?"app-loader app-loader-overlay":"app-loader"} role="status" aria-live="polite"><span className="app-loader-spinner" aria-hidden="true"/><span>{label}</span></div>}
