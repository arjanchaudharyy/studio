## Title
feat: Add comprehensive SEO configuration with robots.txt, sitemap.xml, llms.txt, humans.txt, and JSON-LD structured data

## Description
This PR adds enterprise-grade SEO optimization to ShipSec Studio, enabling better search engine visibility, social media sharing, and AI model discovery.

### What's Changed
- **robots.txt** - Added search engine crawl rules with multi-bot configuration (Google, Bing), rate limiting, sensitive path restrictions, and sitemap references
- **sitemap.xml** - Created comprehensive XML sitemap with 100+ prioritized URLs across studio platform, documentation hub, marketing site, and community resources
- **llms.txt** - Added detailed platform description for AI language models, covering features, value proposition, use cases, and resources
- **humans.txt** - Added friendly team information file with contact details, tech stack, project status, community links, and contribution guidelines
- **frontend/index.html** - Enhanced with:
  - Complete Open Graph (OG) meta tags for social media sharing (Facebook, LinkedIn)
  - Twitter Card meta tags for X/Twitter optimization
  - Rich search engine meta tags (keywords, robots directives, verification placeholders)
  - JSON-LD structured data (Organization and SoftwareApplication schemas)
  - Performance optimizations (preconnect, DNS-prefetch)
  - Canonical URL and language alternates
- **public/.well-known/security.txt** - Added security policy endpoint with vulnerability disclosure contact
- **public/site.webmanifest** - Added PWA manifest for app-like experience

### Why This Is Needed
- **Search Engine Optimization**: Improves crawlability, indexing, and ranking for security-related keywords
- **Social Media Optimization**: Rich preview cards for better sharing on Twitter, Facebook, LinkedIn
- **AI Model Discovery**: Dedicated llms.txt enables language models to better understand the platform
- **Structured Data**: JSON-LD schemas help search engines understand business/software details for rich snippets
- **Security & Transparency**: Security.txt provides clear vulnerability disclosure path for researchers
- **Developer Experience**: humans.txt welcomes developers and provides quick access to resources

### Impact
- ✅ SEO: Expected improvement in search rankings for security automation keywords
- ✅ Social: Professional preview cards across platforms
- ✅ AI: Better context for LLM-based tools and assistants
- ✅ Community: Clear transparency about team, tech stack, and how to contribute
- ✅ Security: Proper disclosure path for security researchers

### Files Modified
```
Modified:   frontend/index.html
Created:    robots.txt
Created:    sitemap.xml
Created:    llms.txt
Created:    humans.txt
Created:    public/.well-known/security.txt
Created:    public/site.webmanifest
```

## Summary
This PR adds a complete SEO and discoverability layer to ShipSec Studio. The configuration enables search engines, social platforms, and AI models to better understand and promote the platform.

## Testing
- [x] `bun run lint` - All files follow project style guidelines
- [x] `bun run typecheck` - TypeScript checks pass
- [x] Manual verification:
  - robots.txt syntax validated
  - sitemap.xml against schema.org specification
  - Meta tags verified in browser DevTools
  - JSON-LD structured data validation

## Additional Notes
- All founding dates set to 2025
- Logo references use existing `/favicon.ico` instead of non-existent assets
- Security contact updated to `contact@shipsec.ai`
- All social media links point to official ShipSec channels
- Verification meta tags left blank (require Google/Microsoft setup)
- PR includes DCO sign-off per contributing guidelines

## Related Issues
N/A

## Checklist
- [x] Changes follow the existing code style and patterns
- [x] No breaking changes introduced
- [x] Documentation aligned with changes
- [x] Commit messages follow Conventional Commits format
- [x] Signed with DCO (`git commit -s`)
