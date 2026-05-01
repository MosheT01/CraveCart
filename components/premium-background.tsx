"use client"

export function PremiumBackground() {
  return (
    <div 
      className="pointer-events-none"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        overflow: "hidden",
      }}
    >
      {/* Base gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-background" />
      
      {/* Subtle orange glow - top right */}
      <div 
        className="absolute -top-32 -right-32 h-96 w-96 rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.72 0.18 50) 0%, transparent 70%)",
          filter: "blur(80px)",
          opacity: 0.08,
        }}
      />
      
      {/* Subtle green glow - bottom left */}
      <div 
        className="absolute -bottom-48 -left-48 h-[500px] w-[500px] rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.65 0.15 145) 0%, transparent 70%)",
          filter: "blur(100px)",
          opacity: 0.06,
        }}
      />
      
      {/* Very subtle center glow */}
      <div 
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full"
        style={{
          background: "radial-gradient(circle, oklch(0.72 0.18 50) 0%, transparent 60%)",
          filter: "blur(120px)",
          opacity: 0.03,
        }}
      />

      {/* Scattered food icons - using inline styles for guaranteed visibility */}
      <div 
        className="absolute inset-0"
        style={{ filter: "blur(0.5px)" }}
      >
        {/* Pizza slice - top left area - LARGE */}
        <svg 
          className="absolute" 
          style={{ top: "8%", left: "12%", width: 96, height: 96, opacity: 0.12, transform: "rotate(12deg)" }}
          viewBox="0 0 24 24" 
          fill="#e07830"
        >
          <path d="M12 2C8.43 2 5.23 3.54 3.01 6L12 22l8.99-16C18.77 3.54 15.57 2 12 2zm0 8c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
        </svg>
        
        {/* Fork and knife - right side - MEDIUM */}
        <svg 
          className="absolute" 
          style={{ top: "22%", right: "8%", width: 80, height: 80, opacity: 0.10, transform: "rotate(-15deg)" }}
          viewBox="0 0 24 24" 
          fill="#5da36a"
        >
          <path d="M11 9H9V2H7v7H5V2H3v7c0 2.12 1.66 3.84 3.75 3.97V22h2.5v-9.03C11.34 12.84 13 11.12 13 9V2h-2v7zm5-3v8h2.5v8H21V2c-2.76 0-5 2.24-5 4z"/>
        </svg>
        
        {/* Bowl/Ramen - bottom right - LARGE */}
        <svg 
          className="absolute" 
          style={{ bottom: "12%", right: "15%", width: 112, height: 112, opacity: 0.11, transform: "rotate(6deg)" }}
          viewBox="0 0 24 24" 
          fill="#e07830"
        >
          <path d="M22 10H2c0 5.5 3.5 10 10 10s10-4.5 10-10zM2.5 8h19c.28 0 .5.22.5.5s-.22.5-.5.5h-19c-.28 0-.5-.22-.5-.5s.22-.5.5-.5zM12 4c-1 0-1.5.5-1.5 1s.5 1 1.5 1 1.5-.5 1.5-1-.5-1-1.5-1z"/>
        </svg>
        
        {/* Leaf/herb - top center-right - SMALL */}
        <svg 
          className="absolute" 
          style={{ top: "35%", right: "32%", width: 56, height: 56, opacity: 0.09, transform: "rotate(45deg)" }}
          viewBox="0 0 24 24" 
          fill="#5da36a"
        >
          <path d="M17 8C8 10 5.9 16.17 3.82 21.34l1.89.66.95-2.3c.48.17.98.3 1.34.3C19 20 22 3 22 3c-1 2-8 2.25-13 3.25S2 11.5 2 13.5s1.75 3.75 1.75 3.75C7 8 17 8 17 8z"/>
        </svg>
        
        {/* Burger - left side middle - LARGE */}
        <svg 
          className="absolute" 
          style={{ top: "42%", left: "5%", width: 112, height: 112, opacity: 0.10, transform: "rotate(-8deg)" }}
          viewBox="0 0 24 24" 
          fill="#e07830"
        >
          <path d="M21 15c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2v-1h18v1zm0-4H3c0-1.1.9-2 2-2h14c1.1 0 2 .9 2 2zM4 19h16c1.1 0 2 .9 2 2H2c0-1.1.9-2 2-2zM2 6c0-2.76 4.48-5 10-5s10 2.24 10 5H2z"/>
        </svg>
        
        {/* Coffee cup - bottom left - MEDIUM */}
        <svg 
          className="absolute" 
          style={{ bottom: "22%", left: "18%", width: 64, height: 64, opacity: 0.09, transform: "rotate(12deg)" }}
          viewBox="0 0 24 24" 
          fill="#5da36a"
        >
          <path d="M2 21h18v-2H2v2zm18-9v-2h-2V8c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v6c0 2.21 1.79 4 4 4h6c2.21 0 4-1.79 4-4h2c1.1 0 2-.9 2-2zm-4 0H4V8h12v4z"/>
        </svg>
        
        {/* Carrot/veggie - top right area - SMALL */}
        <svg 
          className="absolute" 
          style={{ top: "14%", right: "25%", width: 48, height: 48, opacity: 0.10, transform: "rotate(30deg)" }}
          viewBox="0 0 24 24" 
          fill="#e07830"
        >
          <path d="M16.18 19.6l-2.07-3.05 1.27-1.27 3.05 2.07c.39.26.39.87 0 1.13l-1.12 1.12c-.26.26-.87.26-1.13 0zM13 15.83l-1.41 1.41-5.36-5.36A4 4 0 017.5 4.5a4 4 0 015.36 1.25L13 15.83z"/>
        </svg>
        
        {/* Egg/breakfast - center left - SMALL */}
        <svg 
          className="absolute" 
          style={{ top: "62%", left: "28%", width: 48, height: 48, opacity: 0.08, transform: "rotate(-20deg)" }}
          viewBox="0 0 24 24" 
          fill="#5da36a"
        >
          <path d="M12 3C8.5 3 5 9.5 5 14c0 3.31 3.13 6 7 6s7-2.69 7-6c0-4.5-3.5-11-7-11zm0 15c-2.21 0-4-1.79-4-4 0-.55.45-1 1-1s1 .45 1 1c0 1.1.9 2 2 2 .55 0 1 .45 1 1s-.45 1-1 1z"/>
        </svg>
        
        {/* Cheese wedge - bottom center - MEDIUM */}
        <svg 
          className="absolute" 
          style={{ bottom: "8%", left: "45%", width: 72, height: 72, opacity: 0.09, transform: "rotate(15deg)" }}
          viewBox="0 0 24 24" 
          fill="#e07830"
        >
          <path d="M11 3L1 9l10 6 10-6-10-6zm0 8.5L3.3 9 11 6l7.7 3-7.7 2.5zM11 21l-10-6v4l10 6 10-6v-4l-10 6z"/>
        </svg>
        
        {/* Sushi roll - right middle - MEDIUM */}
        <svg 
          className="absolute" 
          style={{ top: "55%", right: "6%", width: 64, height: 64, opacity: 0.10, transform: "rotate(-12deg)" }}
          viewBox="0 0 24 24" 
          fill="#5da36a"
        >
          <circle cx="12" cy="12" r="10"/>
        </svg>
      </div>

      {/* Subtle grain texture overlay */}
      <div 
        className="absolute inset-0"
        style={{
          opacity: 0.015,
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }}
      />
    </div>
  )
}
