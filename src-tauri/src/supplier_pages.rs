use crate::default_app::open_web_url;
use reqwest::Url;

// Hosts used by the bundled supplier palette catalog.
const SUPPLIER_HOSTS: &[&str] = &[
    "store.bblcdn.com",
    "shop.polymaker.com",
    "prusament.com",
    "www.prusa3d.com",
    "www.sunlu.com",
    "www.elegoo.com",
];

fn supplier_url(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "Invalid supplier URL".to_string())?;
    if url.scheme() == "https"
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_none()
        && url.host_str().is_some_and(|host| SUPPLIER_HOSTS.contains(&host))
    {
        Ok(url)
    } else {
        Err("Unsupported supplier URL".to_string())
    }
}

#[tauri::command]
pub async fn open_supplier_page(url: String) -> Result<(), String> {
    let url = supplier_url(&url)?;
    tauri::async_runtime::spawn_blocking(move || open_web_url(&url))
        .await
        .map_err(|error| format!("The browser launcher stopped unexpectedly: {error}"))?
        .map_err(|error| format!("Failed to open the supplier page: {error}"))
}

#[cfg(test)]
mod tests {
    use super::supplier_url;

    #[test]
    fn accepts_https_pages_from_the_bundled_catalog() {
        for url in [
            "https://store.bblcdn.com/catalog.pdf",
            "https://shop.polymaker.com/products/panchroma-pla",
            "https://prusament.com/materials/pla/",
            "https://www.prusa3d.com/product/prusament-pla-pistachio-green-1kg",
            "https://www.sunlu.com/products/pla-classic-filament",
            "https://www.elegoo.com/products/pla-filament-1-75mm-colored-1kg?variant=1",
        ] {
            assert_eq!(supplier_url(url).unwrap().as_str(), url);
        }
    }

    #[test]
    fn rejects_urls_outside_the_supplier_browser_handoff() {
        for url in [
            "http://www.sunlu.com/products/pla-classic-filament",
            "file:///tmp/example",
            "https://www.sunlu.com.example.org/",
            "https://www.sunlu.com@evil.example/",
            "https://example@www.sunlu.com/",
            "https://www.sunlu.com:8443/",
        ] {
            assert!(supplier_url(url).is_err(), "accepted {url}");
        }
    }
}
