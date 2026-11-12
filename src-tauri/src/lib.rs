/// Opens the system print panel for the page, whose print stylesheet shows
/// only the sheet the Print dialog laid out, on paper `width_mm` × `height_mm`
/// (landscape when wider than tall). WKWebView ignores `window.print()`, so
/// the macOS app prints through here. The panel doesn't block, so the page
/// keeps the sheet until the next print.
#[tauri::command]
fn print_sheet(window: tauri::WebviewWindow, width_mm: f64, height_mm: f64) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    return window
        .with_webview(move |webview| unsafe { mac_print::run(webview.inner(), width_mm, height_mm) })
        .map_err(|e| e.to_string());
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (width_mm, height_mm);
        window.print().map_err(|e| e.to_string())
    }
}

#[cfg(target_os = "macos")]
mod mac_print {
    use objc2_app_kit::{NSPaperOrientation, NSPrintInfo};
    use objc2_foundation::NSSize;
    use objc2_web_kit::WKWebView;

    const POINTS_PER_MM: f64 = 72.0 / 25.4;

    /// Runs on the main thread (from `with_webview`), with the app's WKWebView.
    pub unsafe fn run(webview: *mut std::ffi::c_void, width_mm: f64, height_mm: f64) {
        let webview = unsafe { &*(webview as *const WKWebView) };
        let info = NSPrintInfo::sharedPrintInfo();
        info.setOrientation(if width_mm > height_mm {
            NSPaperOrientation::Landscape
        } else {
            NSPaperOrientation::Portrait
        });
        info.setPaperSize(NSSize::new(width_mm * POINTS_PER_MM, height_mm * POINTS_PER_MM));
        // The sheet draws its own margins (and frame).
        info.setTopMargin(0.0);
        info.setBottomMargin(0.0);
        info.setLeftMargin(0.0);
        info.setRightMargin(0.0);
        let operation = unsafe { webview.printOperationWithPrintInfo(&info) };
        operation.setShowsPrintPanel(true);
        operation.setShowsProgressPanel(true);
        // WebKit's print view starts with no size, and then prints nothing.
        if let Some(view) = operation.view() {
            view.setFrame(webview.bounds());
        }
        match webview.window() {
            Some(window) => unsafe {
                operation.runOperationModalForWindow_delegate_didRunSelector_contextInfo(
                    &window,
                    None,
                    None,
                    std::ptr::null_mut(),
                )
            },
            None => eprintln!("print_sheet: the web view has no window"),
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![print_sheet])
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while building tauri application");
}
