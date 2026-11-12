use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{Emitter, Manager};
use tauri_plugin_fs::FsExt;

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

/// Circuit files the system asked Ampage to open (double-clicked, or dropped
/// on the app's icon), waiting for the page to take them.
#[derive(Default)]
struct Opened(Mutex<Vec<String>>);

/// The circuit files waiting to be opened, oldest first; taken, so each is
/// opened once.
#[tauri::command]
fn opened_files(opened: tauri::State<Opened>) -> Vec<String> {
    std::mem::take(&mut *opened.0.lock().unwrap())
}

/// Queue circuit files (.ampage, or .json from before) for the page, which
/// may then read and save them, and tell it they're there.
fn open_files(app: &tauri::AppHandle, paths: impl IntoIterator<Item = PathBuf>) {
    let paths: Vec<String> = paths
        .into_iter()
        .filter(|p| p.extension().is_some_and(|e| e.eq_ignore_ascii_case("ampage") || e.eq_ignore_ascii_case("json")))
        .filter_map(|p| {
            app.fs_scope().allow_file(&p).ok()?;
            Some(p.to_string_lossy().into_owned())
        })
        .collect();
    if paths.is_empty() {
        return;
    }
    app.state::<Opened>().0.lock().unwrap().extend(paths);
    let _ = app.emit("files-opened", ());
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Windows: a file double-clicked while Ampage runs starts a second copy;
    // it hands the file to this one instead (macOS sends it as an event).
    #[cfg(not(target_os = "macos"))]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, cwd| {
        open_files(app, argv.into_iter().skip(1).map(|arg| PathBuf::from(&cwd).join(arg)));
        if let Some(window) = app.get_webview_window("main") {
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }));
    builder
        .manage(Opened::default())
        .invoke_handler(tauri::generate_handler![print_sheet, opened_files])
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
            // Windows: the file Ampage was started to open comes as an argument.
            #[cfg(not(target_os = "macos"))]
            open_files(app.handle(), std::env::args_os().skip(1).map(PathBuf::from));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // macOS: files opened from Finder, at launch or later.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                open_files(app, urls.into_iter().filter_map(|url| url.to_file_path().ok()));
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}
