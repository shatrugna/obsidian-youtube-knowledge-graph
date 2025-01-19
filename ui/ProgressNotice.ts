export class ProgressNotice {
    private container: HTMLElement;
    private messageEl: HTMLElement;
    private progressBar: HTMLElement;
    private progress: number;

    constructor(message: string) {
        this.progress = 0;
        this.createContainer(message);
    }

    private createContainer(message: string) {
        const existing = document.querySelector('.progress-notice');
        if (existing) {
            existing.remove();
        }

        this.container = document.createElement('div');
        this.container.className = 'progress-notice';
        this.container.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            background-color: var(--background-primary);
            border: 1px solid var(--background-modifier-border);
            border-radius: 8px;
            padding: 15px;
            z-index: 1000;
            box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
            width: 300px;
        `;

        this.messageEl = document.createElement('div');
        this.messageEl.textContent = message;
        this.container.appendChild(this.messageEl);

        const progressContainer = document.createElement('div');
        progressContainer.style.cssText = `
            width: 100%;
            background-color: var(--background-modifier-border);
            height: 8px;
            border-radius: 4px;
            margin-top: 8px;
        `;

        this.progressBar = document.createElement('div');
        this.progressBar.style.cssText = `
            height: 100%;
            background-color: var(--interactive-accent);
            border-radius: 4px;
            transition: width 0.3s ease;
            width: 0%;
        `;
        progressContainer.appendChild(this.progressBar);

        this.container.appendChild(progressContainer);
        document.body.appendChild(this.container);
    }

    setProgress(progress: number) {
        this.progress = Math.min(100, Math.max(0, progress));
        this.progressBar.style.width = `${this.progress}%`;
    }

    setMessage(message: string) {
        this.messageEl.textContent = message;
    }

    hide() {
        if (this.container && this.container.parentNode) {
            this.container.parentNode.removeChild(this.container);
        }
    }
}