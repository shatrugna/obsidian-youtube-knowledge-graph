import { App, Modal } from 'obsidian';

export class YouTubeInputModal extends Modal {
    private onSubmit: (url: string) => void;

    constructor(app: App, onSubmit: (url: string) => void) {
        super(app);
        this.onSubmit = onSubmit;
    }

    onOpen() {
        const {contentEl} = this;

        contentEl.createEl("h2", {text: "Add YouTube Video for Analysis"});

        const urlInput = contentEl.createEl("input", {
            type: "text",
            attr: {
                placeholder: "Paste YouTube URL here...",
                style: "width: 100%; padding: 5px; margin-bottom: 10px;"
            }
        });

        const submitBtn = contentEl.createEl("button", {
            text: "Analyze Video",
            attr: {
                style: "padding: 5px 10px; margin-right: 10px;"
            }
        });
        submitBtn.addEventListener("click", () => {
            this.onSubmit(urlInput.value);
            this.close();
        });

        const cancelBtn = contentEl.createEl("button", {
            text: "Cancel",
            attr: {
                style: "padding: 5px 10px;"
            }
        });
        cancelBtn.addEventListener("click", () => this.close());
    }

    onClose() {
        const {contentEl} = this;
        contentEl.empty();
    }
}