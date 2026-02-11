import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import LaunchPost from "./posts/launch";

const posts: Record<string, {
  title: string;
  date: string;
  author: string;
  authorUrl: string;
  tags: string[];
  content: React.ComponentType;
}> = {
  launch: {
    title: "A team of agents (PM, Eng, QA) tackles my Linear tickets while I\u2019m driving",
    date: "June 10, 2025",
    author: "Stepan",
    authorUrl: "https://x.com/stepanarsent",
    tags: ["Launch", "Agents", "Workflow"],
    content: LaunchPost,
  },
};

export function generateStaticParams() {
  return Object.keys(posts).map((slug) => ({ slug }));
}

export default async function BlogPost({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const post = posts[slug];
  if (!post) notFound();

  const Content = post.content;

  return (
    <article className="max-w-2xl mx-auto px-8">
      {/* Header */}
      <header className="mb-12">
        <h1 className="text-[clamp(1.8rem,4vw,2.5rem)] font-extrabold tracking-tight leading-tight mb-5">
          {post.title}
        </h1>
        <div className="flex items-center gap-3 flex-wrap mb-5">
          <span className="text-sm text-muted-foreground">
            by{" "}
            <a
              href={post.authorUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-foreground font-medium hover:text-primary transition-colors"
            >
              {post.author}
            </a>
          </span>
          <span className="text-muted-foreground/30">&middot;</span>
          <time className="text-sm text-muted-foreground/70 font-mono">
            {post.date}
          </time>
          <span className="text-muted-foreground/30">&middot;</span>
          <div className="flex gap-1.5">
            {post.tags.map((tag) => (
              <Badge
                key={tag}
                variant="outline"
                className="text-[11px] font-medium text-muted-foreground bg-card/50 border-border"
              >
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <div className="h-px bg-border" />
      </header>

      {/* Body */}
      <Content />

      {/* Back link */}
      <div className="mt-14 pt-8 border-t border-border">
        <a
          href="/blog"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          &larr; Back to blog
        </a>
      </div>
    </article>
  );
}
