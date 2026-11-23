use std::process::Command;

use clap::Args;

use crate::commands::app_start::{compose_modules, load_app_module_name};
use crate::utils::{
    ModulePort, RunnableModule, collect_module_ports, collect_runnable_modules, current_dir,
    ensure_bin, free_port, run_spinner_step, select_runnable_modules,
};

#[derive(Args, Debug)]
pub struct AppStopArgs {
    #[arg(long)]
    pub modules: Option<String>,

    #[arg(long)]
    pub packages: Option<String>,

    #[arg(long)]
    pub cwd: Option<String>,
}

/// Free every port the selected modules declare, and report the ones that were
/// actually held by a process.
fn free_module_ports(modules: &[RunnableModule]) -> usize {
    let mut freed = 0;
    for ModulePort { module, port } in collect_module_ports(modules) {
        let pids = free_port(port);
        if pids.is_empty() {
            continue;
        }
        freed += 1;
        let pids = pids
            .iter()
            .map(u32::to_string)
            .collect::<Vec<_>>()
            .join(", ");
        crate::utils::success(format!("Freed port {port} of {module} (pid {pids})"));
    }
    freed
}

pub fn run(args: &AppStopArgs) {
    let cwd = args
        .cwd
        .clone()
        .map(std::path::PathBuf::from)
        .unwrap_or_else(current_dir);
    // Stopping is best effort: a failing step is reported and the remaining
    // ones still run, so a partial stop never leaves the rest running.
    let mut failed = false;

    let modules = collect_runnable_modules(&cwd.join("modules"));
    let selected =
        select_runnable_modules(&modules, args.modules.as_deref(), args.packages.as_deref());
    if selected.is_empty() {
        crate::utils::error("No matching modules found");
        std::process::exit(1);
    }

    let freed = free_module_ports(&selected);

    // Only the selected back-end modules' own Compose stacks are stopped.
    let compose = compose_modules(&selected);
    if !compose.is_empty() {
        if ensure_bin("docker") {
            for module in compose {
                let name = load_app_module_name(&module.dir, &module.name)
                    .unwrap_or_else(|| module.name.clone());
                failed |= !run_spinner_step(
                    false,
                    &format!("Stopping Docker services for {name}"),
                    Command::new("docker")
                        .args(["compose", "down"])
                        .current_dir(&module.dir),
                );
            }
        } else {
            failed = true;
        }
    } else if freed == 0 {
        crate::utils::error("Nothing to stop");
        failed = true;
    }

    if failed {
        std::process::exit(1);
    }
}
