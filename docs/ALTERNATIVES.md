# Alternative Approaches to PPTX Viewing

This document explores alternative approaches to displaying PowerPoint files in web applications and their limitations.

## Microsoft's Embedded Viewer

Microsoft offers an embedded PowerPoint viewer that supports animations, videos, and transitions. However, it has significant limitations for enterprise use.

### Personal OneDrive (Works with Limitations)

For **personal** OneDrive accounts, you can embed presentations using:

```html
<iframe src="https://onedrive.live.com/embed?resid=FILE_ID&authkey=AUTH_KEY"
        width="800" height="600" frameborder="0">
</iframe>
```

**Limitations:**
- File must be publicly shared or have a shareable link
- Data is processed through Microsoft's servers
- Requires internet connectivity to Microsoft services

### OneDrive for Business / SharePoint (Blocked)

For **enterprise** OneDrive for Business and SharePoint accounts, iframe embedding is **blocked by default**:

- **Content Security Policy (CSP)**: Microsoft sets `X-Frame-Options: SAMEORIGIN` on SharePoint/OneDrive for Business, preventing embedding in third-party applications
- **Tenant restrictions**: Even with Microsoft Graph API access to files, the embed URLs return CSP errors when loaded in iframes outside of Microsoft's domains
- **No workaround**: Unlike personal accounts, there's no embed endpoint that bypasses these restrictions for Business accounts

```
# Typical error when trying to iframe SharePoint/OneDrive for Business:
Refused to display 'https://company.sharepoint.com/...' in a frame
because it set 'X-Frame-Options' to 'sameorigin'.
```

### Microsoft Graph API

The Microsoft Graph API can retrieve file metadata and download URLs, but:

- Download URLs are for downloading the file, not viewing it
- There's no "viewer URL" endpoint that returns an embeddable frame for Business accounts
- Preview URLs (`/preview` endpoint) still enforce the same CSP restrictions

### Summary: When Microsoft Embed Works

| Scenario | Embeddable? | Notes |
|----------|-------------|-------|
| Personal OneDrive (public link) | ✅ Yes | Use embed URL |
| Personal OneDrive (private) | ❌ No | Requires auth |
| OneDrive for Business | ❌ No | CSP blocks iframe |
| SharePoint Online | ❌ No | CSP blocks iframe |
| SharePoint On-Premises | ⚠️ Maybe | Depends on admin config |

---

## HTML Conversion Libraries

Several JavaScript libraries exist that convert PPTX files to HTML for browser display (e.g., `pptx-preview`, `pptx2html`). While these offer a simpler deployment model (no Docker containers), they have significant limitations.

### What Gets Lost in HTML Conversion

| Feature | Preserved? | Notes |
|---------|------------|-------|
| Basic text | ✅ Mostly | Font substitution may occur |
| Simple shapes | ⚠️ Partial | Complex shapes may render incorrectly |
| Images | ✅ Yes | Usually preserved |
| Charts | ❌ Often broken | Complex charts may not render |
| SmartArt | ❌ Usually broken | Converts poorly |
| Custom fonts | ❌ No | Falls back to system fonts |
| Precise positioning | ⚠️ Approximate | Layout shifts are common |
| Slide masters/themes | ⚠️ Partial | May lose styling |
| Animations | ❌ No | Not converted |
| Transitions | ❌ No | Not converted |
| Videos/Audio | ❌ No | Not converted |
| 3D effects | ❌ No | Not supported |
| Gradients | ⚠️ Partial | Simple gradients only |

### The Fidelity Problem

PowerPoint's OOXML format is extremely complex. HTML conversion libraries essentially:

1. Parse the XML structure
2. Attempt to map PowerPoint elements to HTML/CSS equivalents
3. Render using browser capabilities

This mapping is **lossy by design** - HTML/CSS simply cannot represent all PowerPoint features. The result is often presentations that look "close" but have noticeable differences:

- Text wrapping behaves differently
- Spacing and margins shift
- Colors may not match exactly (color space differences)
- Complex layouts break down

### When HTML Conversion Makes Sense

- Quick previews where fidelity isn't critical
- Simple presentations with basic text and images
- Environments where Docker isn't available
- Thumbnail generation

---

## Why ONLYOFFICE and Collabora

ONLYOFFICE and Collabora don't convert to HTML - they use **actual office suite rendering engines**:

- **ONLYOFFICE**: Custom OOXML engine built specifically for Office formats
- **Collabora**: LibreOffice's rendering engine (which handles OOXML natively)

These engines interpret the PPTX format directly, providing much higher fidelity than HTML conversion. The tradeoff is infrastructure complexity (Docker containers, more memory).

### Limitations

Both render presentations as **static slides**:

| Feature | ONLYOFFICE | Collabora | Notes |
|---------|------------|-----------|-------|
| Embedded videos | ❌ | ❌ | Shows placeholder only |
| Video playback | ❌ | ❌ | No playback capability |
| Animations | ❌ | ❌ | Slides render in final state |
| Transitions | ⚠️ Limited | ⚠️ Limited | Basic only |
| Embedded audio | ❌ | ❌ | No playback |

### Comparison

| Feature | ONLYOFFICE | Collabora |
|---------|------------|-----------|
| Rendering Engine | Custom OOXML | LibreOffice |
| PPTX Compatibility | Excellent | Very Good |
| License | AGPL 3.0 | MPL 2.0 |
| Memory Usage | ~500MB | ~300MB |
| Startup Time | ~30s | ~20s |
| Edit Support | Yes | Yes |
