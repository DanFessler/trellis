import { Footer } from "./components/Footer";
import { Nav } from "./components/Nav";
import { Link } from "./router";

export function NotFound() {
  return (
    <>
      <Nav solid />
      <main className="container not-found">
        <p className="eyebrow">404</p>
        <h1>This branch doesn’t grow here.</h1>
        <p>The page you’re looking for doesn’t exist or has moved.</p>
        <div className="hero-ctas">
          <Link className="btn btn-primary" href="/">Back home</Link>
          <Link className="btn btn-ghost" href="/docs/introduction">Read the docs</Link>
        </div>
      </main>
      <Footer />
    </>
  );
}
