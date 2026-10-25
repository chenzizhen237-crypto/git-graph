//! The font families installed on this machine, for the Fonts settings page.

use serde::Serialize;
use std::collections::BTreeMap;

#[derive(Serialize)]
pub struct FontFamily {
    pub name: String,
    /// Every face of the family is fixed-width.
    pub mono: bool,
}

/// Families in name order; hidden system families (`.SF NS` and the like) left out.
pub fn families() -> Vec<FontFamily> {
    let mut db = fontdb::Database::new();
    db.load_system_fonts();
    // Lowercase name → (name, every face fixed-width, a face to measure).
    let mut map: BTreeMap<String, (String, bool, fontdb::ID)> = BTreeMap::new();
    for face in db.faces() {
        let Some((name, _)) = face.families.first() else {
            continue;
        };
        if name.starts_with('.') || name.is_empty() {
            continue;
        }
        let entry = map
            .entry(name.to_lowercase())
            .or_insert_with(|| (name.clone(), true, face.id));
        entry.1 &= face.monospaced;
    }
    map.into_values()
        .map(|(name, flagged, id)| FontFamily {
            mono: flagged || db.with_face_data(id, same_widths).unwrap_or(false),
            name,
        })
        .collect()
}

/// Older fonts like Courier don't set the fixed-pitch flag; compare a few glyph widths instead.
fn same_widths(data: &[u8], index: u32) -> bool {
    let Ok(face) = ttf_parser::Face::parse(data, index) else {
        return false;
    };
    let widths: Vec<_> = ['i', 'M', 'W', '.', '0']
        .iter()
        .map(|&c| face.glyph_index(c).and_then(|g| face.glyph_hor_advance(g)))
        .collect();
    widths.iter().all(|w| w.is_some() && *w == widths[0])
}

#[tauri::command]
pub async fn system_fonts() -> Vec<FontFamily> {
    tauri::async_runtime::spawn_blocking(families)
        .await
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    #[test]
    fn lists_some_families() {
        let all = super::families();
        let mut names: Vec<_> = all.iter().map(|f| f.name.to_lowercase()).collect();
        names.dedup();
        assert_eq!(names.len(), all.len(), "families are unique");
        if cfg!(target_os = "macos") {
            let mono = |n: &str| all.iter().any(|f| f.name == n && f.mono);
            assert!(
                mono("Menlo") && mono("Courier"),
                "fixed-width by flag and by measuring"
            );
            assert!(!all.iter().any(|f| f.name == "Helvetica" && f.mono));
        }
    }
}
