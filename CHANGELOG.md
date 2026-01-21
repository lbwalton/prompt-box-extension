# Changelog

## [2.1.0] - 2026-01-21
### Security
- **XSS Protection**: Added HTML escaping for all user-generated content (titles, prompts, tags) to prevent script injection.
- **Content Security Policy**: Added explicit CSP to block unauthorized scripts from running.

## [2.0.0] - 2026-01-14
### Added
- **Filter by tag**: Easily find prompts by their category.
- **Sort functionality**: Sort by Title (A-Z), Date, or Favorites.
- **Favorites**: Star your most frequently used prompts.
- **Import/Export**: Backup your prompts to CSV or import from a spreadsheet.
- **Tag Management**: create, edit, and delete custom tags.

### Fixed
- Squashed a few bugs to improve stability.
- Improved search functionality.
