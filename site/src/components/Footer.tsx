import { Link } from "../router";
import { Brand } from "./Logo";
import { GITHUB_URL, SPONSORS_URL } from "./Nav";

export function Footer() {
  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Link href="/" aria-label="Trellis home">
              <Brand />
            </Link>
            <p className="footer-blurb">
              Dockable, zoomable workspaces for web tools. Made by Dan Fessler, author of react-dockable.
            </p>
          </div>
          <div>
            <h4>Docs</h4>
            <ul>
              <li>
                <Link href="/docs/introduction">Introduction</Link>
              </li>
              <li>
                <Link href="/docs/quick-start-react">Quick start</Link>
              </li>
              <li>
                <Link href="/docs/concepts">Concepts</Link>
              </li>
              <li>
                <Link href="/docs/react-api">API reference</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Project</h4>
            <ul>
              <li>
                <Link href="/#examples">Examples</Link>
              </li>
              <li>
                <Link href="/#theming">Theming</Link>
              </li>
              <li>
                <Link href="/docs/faq">FAQ</Link>
              </li>
              <li>
                <a href={GITHUB_URL} target="_blank" rel="noreferrer">
                  GitHub
                </a>
              </li>
            </ul>
          </div>
          <div>
            <h4>License</h4>
            <ul>
              <li>
                <Link href="/#pricing">Pricing</Link>
              </li>
              <li>
                <Link href="/docs/license">License terms</Link>
              </li>
              <li>
                <a href={SPONSORS_URL} target="_blank" rel="noreferrer">
                  GitHub Sponsors
                </a>
              </li>
              <li>
                <a href="mailto:dan@danfessler.com">Enterprise</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© {new Date().getFullYear()} Dan Fessler. Free for non-commercial use.</span>
          <span>@danfessler/trellis</span>
        </div>
      </div>
    </footer>
  );
}
