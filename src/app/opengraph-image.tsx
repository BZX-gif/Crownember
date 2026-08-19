import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "CLUTCHZONE — Free Fire Gaming Community";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",justifyContent:"center",padding:70,background:"#020617",color:"white",fontFamily:"sans-serif"}}>
      <div style={{display:"flex",fontSize:28,fontWeight:800,letterSpacing:6,color:"#fb923c"}}>🔥 CLUTCHZONE</div>
      <div style={{display:"flex",marginTop:28,fontSize:72,fontWeight:900}}>FREE FIRE COMMUNITY</div>
      <div style={{display:"flex",marginTop:24,fontSize:30,color:"#cbd5e1"}}>Chat. Find squads. Build your profile. Compete with the community.</div>
      <div style={{display:"flex",marginTop:44,fontSize:22,color:"#64748b",letterSpacing:3}}>BUILT FOR PLAYERS • BUILT FOR THE CLUTCH</div>
    </div>,
    size,
  );
}
