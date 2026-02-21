export default function BlogLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4 backdrop-blur-md bg-background/80 border-b border-border">
        <a href="/" className="flex items-center gap-2.5">
          <img src="/logo.svg" alt="Clawup" className="h-7 w-7" />
          <span className="text-base font-bold tracking-tight">Clawup</span>
        </a>
        <div className="flex items-center gap-6">
          <a
            href="/blog/launch"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Blog
          </a>
          <a
            href="https://docs.clawup.ai"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Docs
          </a>
          <a
            href="https://github.com/stepandel/clawup"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </a>
        </div>
      </nav>

      {/* Content */}
      <main className="pt-36 pb-24">{children}</main>

      {/* Footer */}
      <footer className="border-t border-border px-8 py-10">
        <div className="max-w-5xl mx-auto flex flex-col gap-6">
          <div className="flex justify-between items-center flex-wrap gap-5">
            <div className="flex items-center gap-2.5">
              <img src="/logo.svg" alt="Clawup" className="h-5 w-5" />
              <span className="text-sm font-semibold text-muted-foreground">
                Clawup
              </span>
            </div>
            <div className="flex gap-7 flex-wrap">
              {[
                { label: "Blog", href: "/blog/launch" },
                { label: "GitHub", href: "https://github.com/stepandel/clawup" },
                { label: "Documentation", href: "https://docs.clawup.ai" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  target={link.href.startsWith("http") ? "_blank" : undefined}
                  rel={link.href.startsWith("http") ? "noopener noreferrer" : undefined}
                  className="text-xs text-muted-foreground/70 hover:text-muted-foreground transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
          <div className="text-center">
            <a
              href="https://openclaw.ai"
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors"
            >
              Powered by OpenClaw 🦞
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
