import { invoke } from "@tauri-apps/api/core";
import { emit, listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { Check, Copy, Loader2, Moon, Plus, Sun, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";

import "./App.css";

type Note = {
	id: string;
	text: string;
	created_at: string;
	updated_at?: string | null;
};

const NOTES_CHANGED_EVENT = "notes-changed";
const CAPTURE_OPENED_EVENT = "capture-opened";
const THEME_STORAGE_KEY = "jotin-theme";
const THEME_CHANGED_EVENT = "theme-changed";
const windowHandle = getCurrentWindow();
type ThemeMode = "light" | "dark";

function detectInitialTheme(): ThemeMode {
	const stored = localStorage.getItem(THEME_STORAGE_KEY);
	if (stored === "light" || stored === "dark") {
		return stored;
	}

	return window.matchMedia("(prefers-color-scheme: dark)").matches
		? "dark"
		: "light";
}

function formatTimestamp(timestamp: string) {
	const date = new Date(timestamp);
	if (Number.isNaN(date.getTime())) {
		return timestamp;
	}

	return new Intl.DateTimeFormat(undefined, {
		year: "numeric",
		month: "short",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
	}).format(date);
}

function CaptureWindow() {
	const [draft, setDraft] = useState("");
	const [error, setError] = useState<string | null>(null);
	const textareaRef = useRef<HTMLTextAreaElement | null>(null);

	const focusInput = useCallback(() => {
		const attemptFocus = (remainingAttempts: number) => {
			const input = textareaRef.current;
			if (!input) {
				if (remainingAttempts > 0) {
					setTimeout(() => attemptFocus(remainingAttempts - 1), 30);
				}
				return;
			}

			input.focus({ preventScroll: true });
			input.select();

			if (document.activeElement !== input && remainingAttempts > 0) {
				setTimeout(() => attemptFocus(remainingAttempts - 1), 35);
			}
		};

		requestAnimationFrame(() => {
			attemptFocus(8);
		});
	}, []);

	const closeCapture = useCallback(async () => {
		setError(null);
		setDraft("");
		try {
			await invoke("close_quick_capture");
		} catch {
			void windowHandle.hide();
		}
	}, []);

	const submitNote = useCallback(async () => {
		const trimmed = draft.trim();
		if (!trimmed) {
			await closeCapture();
			return;
		}

		try {
			await invoke("create_note", { text: draft });
			await closeCapture();
		} catch (submitError) {
			setError(
				submitError instanceof Error
					? submitError.message
					: String(submitError),
			);
		}
	}, [closeCapture, draft]);

	useEffect(() => {
		focusInput();

		let unlistenEvent: (() => void) | undefined;
		void listen(CAPTURE_OPENED_EVENT, () => {
			setDraft("");
			setError(null);
			focusInput();
			setTimeout(() => focusInput(), 120);
		}).then((unlisten) => {
			unlistenEvent = unlisten;
		});

		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape" || event.key === "Esc") {
				event.preventDefault();
				void closeCapture();
			}
		};

		const onWindowFocus = () => {
			focusInput();
		};

		window.addEventListener("keydown", onKeyDown);
		window.addEventListener("focus", onWindowFocus);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
			window.removeEventListener("focus", onWindowFocus);
			unlistenEvent?.();
		};
	}, [closeCapture, focusInput]);

	return (
		<main className="h-screen bg-transparent">
			<section className="flex h-full w-full items-center gap-2 rounded-[12px] bg-card px-3 py-2 text-card-foreground">
				<Textarea
					ref={textareaRef}
					className="min-h-0 h-8 flex-1 resize-none border-0 bg-transparent p-0 text-2xl font-semibold shadow-none focus-visible:ring-0"
					placeholder="Type a note, then press Enter"
					rows={1}
					value={draft}
					onChange={(event) => setDraft(event.currentTarget.value)}
					onKeyDown={(event) => {
						if (event.key === "Escape" || event.key === "Esc") {
							event.preventDefault();
							void closeCapture();
							return;
						}

						if (
							event.key === "Enter" &&
							!event.metaKey &&
							!event.shiftKey &&
							!event.ctrlKey &&
							!event.altKey
						) {
							event.preventDefault();
							void submitNote();
						}
					}}
				/>
				<div className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
					<KbdGroup>
						<Kbd className="h-6 rounded-md px-2 text-[11px]">enter</Kbd>
						<span>save</span>
					</KbdGroup>
					<KbdGroup>
						<Kbd className="h-6 rounded-md px-2 text-[11px]">esc</Kbd>
						<span>close</span>
					</KbdGroup>
				</div>
			</section>
			{error ? (
				<p className="px-1 pt-1 text-xs text-destructive">{error}</p>
			) : null}
		</main>
	);
}

function NotesWindow({
	theme,
	onToggleTheme,
}: {
	theme: ThemeMode;
	onToggleTheme: () => void;
}) {
	const [notes, setNotes] = useState<Note[]>([]);
	const [search, setSearch] = useState("");
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [copiedNoteId, setCopiedNoteId] = useState<string | null>(null);
	const copiedTimerRef = useRef<number | null>(null);

	const loadNotes = useCallback(async () => {
		try {
			setError(null);
			const noteList = await invoke<Note[]>("list_notes");
			setNotes(noteList);
		} catch (loadError) {
			setError(
				loadError instanceof Error ? loadError.message : String(loadError),
			);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		void loadNotes();
	}, [loadNotes]);

	useEffect(() => {
		let unlistenEvent: (() => void) | undefined;
		void listen(NOTES_CHANGED_EVENT, () => {
			void loadNotes();
		}).then((unlisten) => {
			unlistenEvent = unlisten;
		});

		return () => {
			unlistenEvent?.();
		};
	}, [loadNotes]);

	const filteredNotes = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) {
			return notes;
		}

		return notes.filter((note) => note.text.toLowerCase().includes(query));
	}, [notes, search]);

	const onDelete = useCallback(async (id: string) => {
		try {
			await invoke("delete_note", { id });
		} catch (deleteError) {
			setError(
				deleteError instanceof Error
					? deleteError.message
					: String(deleteError),
			);
		}
	}, []);

	const markCopied = useCallback((noteId: string) => {
		setCopiedNoteId(noteId);
		if (copiedTimerRef.current !== null) {
			window.clearTimeout(copiedTimerRef.current);
		}
		copiedTimerRef.current = window.setTimeout(() => {
			setCopiedNoteId((current) => (current === noteId ? null : current));
		}, 1200);
	}, []);

	useEffect(() => {
		return () => {
			if (copiedTimerRef.current !== null) {
				window.clearTimeout(copiedTimerRef.current);
			}
		};
	}, []);

	const onCopy = useCallback(
		async (id: string, text: string) => {
			try {
				await invoke("copy_note_text", { text });
				try {
					await navigator.clipboard.writeText(text);
				} catch {
					// backend copy already succeeded
				}
				setError(null);
				markCopied(id);
			} catch (copyError) {
				try {
					await navigator.clipboard.writeText(text);
					setError(null);
					markCopied(id);
				} catch {
					setError(
						copyError instanceof Error
							? copyError.message
							: "Failed to copy note.",
					);
				}
			}
		},
		[markCopied],
	);

	const onOpenCapture = useCallback(async () => {
		try {
			await invoke("open_quick_capture");
		} catch {
			setError("Failed to open quick capture window.");
		}
	}, []);

	return (
		<main className="flex h-screen flex-col gap-3 bg-background p-4 text-foreground">
			<header className="flex items-center justify-between gap-2">
				<h1 className="text-xl font-semibold tracking-tight">Jotin</h1>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						variant="outline"
						size="icon-sm"
						className="border-border bg-card text-foreground hover:bg-secondary hover:text-foreground dark:hover:bg-secondary"
						onClick={onToggleTheme}
						aria-label="Toggle theme"
						title={
							theme === "dark" ? "Switch to light mode" : "Switch to dark mode"
						}
					>
						{theme === "dark" ? (
							<Sun className="size-4" />
						) : (
							<Moon className="size-4" />
						)}
					</Button>
					<Button type="button" size="sm" onClick={() => void onOpenCapture()}>
						<Plus className="size-4" />
						New
					</Button>
				</div>
			</header>

			<Input
				type="search"
				value={search}
				onChange={(event) => setSearch(event.currentTarget.value)}
				placeholder="Search notes"
			/>

			{error ? <p className="text-sm text-destructive">{error}</p> : null}

			{loading ? (
				<div className="flex items-center gap-2 text-sm text-muted-foreground">
					<Loader2 className="size-4 animate-spin" />
					Loading notes...
				</div>
			) : null}

			{!loading && filteredNotes.length === 0 ? (
				<p className="text-sm text-muted-foreground">No notes yet.</p>
			) : null}

			{!loading && filteredNotes.length > 0 ? (
				<ScrollArea className="flex-1">
					<ul className="space-y-2 pr-1 pb-3">
						{filteredNotes.map((note) => (
							<li key={note.id}>
								<Card className="gap-3 py-3">
									<CardContent className="px-4">
										<p className="whitespace-pre-wrap break-words text-sm leading-6">
											{note.text}
										</p>
										<div className="mt-3 flex items-center justify-between gap-3">
											<time className="text-xs text-muted-foreground">
												{formatTimestamp(note.created_at)}
											</time>
											<div className="flex items-center gap-1">
												<Button
													type="button"
													variant="outline"
													size="icon-sm"
													className="border-border bg-card text-muted-foreground hover:bg-secondary hover:text-foreground dark:hover:bg-secondary"
													aria-label="Copy note"
													title={
														copiedNoteId === note.id ? "Copied" : "Copy note"
													}
													onClick={() => void onCopy(note.id, note.text)}
												>
													{copiedNoteId === note.id ? (
														<Check className="size-4 text-emerald-600" />
													) : (
														<Copy className="size-4" />
													)}
												</Button>
												<Button
													type="button"
													variant="outline"
													size="icon-sm"
													className="border-border bg-card text-destructive hover:bg-destructive/20 hover:text-destructive dark:hover:bg-destructive/30"
													aria-label="Delete note"
													title="Delete note"
													onClick={() => void onDelete(note.id)}
												>
													<Trash2 className="size-4" />
												</Button>
											</div>
										</div>
									</CardContent>
								</Card>
							</li>
						))}
					</ul>
				</ScrollArea>
			) : null}
		</main>
	);
}

function App() {
	const isCaptureWindow = windowHandle.label === "capture";
	const [theme, setTheme] = useState<ThemeMode>(detectInitialTheme);

	const toggleTheme = useCallback(() => {
		setTheme((previous) => (previous === "dark" ? "light" : "dark"));
	}, []);

	useEffect(() => {
		document.body.classList.toggle("capture-window", isCaptureWindow);
		return () => {
			document.body.classList.remove("capture-window");
		};
	}, [isCaptureWindow]);

	useEffect(() => {
		let unlistenTheme: (() => void) | undefined;
		void listen<ThemeMode>(THEME_CHANGED_EVENT, (event) => {
			if (event.payload === "light" || event.payload === "dark") {
				setTheme(event.payload);
			}
		}).then((unlisten) => {
			unlistenTheme = unlisten;
		});

		const onStorage = (event: StorageEvent) => {
			if (
				event.key === THEME_STORAGE_KEY &&
				(event.newValue === "light" || event.newValue === "dark")
			) {
				setTheme(event.newValue);
			}
		};

		window.addEventListener("storage", onStorage);
		return () => {
			window.removeEventListener("storage", onStorage);
			unlistenTheme?.();
		};
	}, []);

	useEffect(() => {
		if (!isCaptureWindow) {
			return;
		}

		let unlistenCaptureOpen: (() => void) | undefined;
		void listen(CAPTURE_OPENED_EVENT, () => {
			setTheme(detectInitialTheme());
		}).then((unlisten) => {
			unlistenCaptureOpen = unlisten;
		});

		return () => {
			unlistenCaptureOpen?.();
		};
	}, [isCaptureWindow]);

	useEffect(() => {
		document.documentElement.classList.toggle("dark", theme === "dark");
		localStorage.setItem(THEME_STORAGE_KEY, theme);
		void emit(THEME_CHANGED_EVENT, theme);
	}, [theme]);

	return isCaptureWindow ? (
		<CaptureWindow />
	) : (
		<NotesWindow theme={theme} onToggleTheme={toggleTheme} />
	);
}

export default App;
