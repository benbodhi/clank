const fs = require('node:fs/promises');
const path = require('node:path');
const logger = require('../utils/logger');

/**
 * Persists the sweep position and recently handled logs, so a restart resumes
 * where it stopped without reposting. Losing this file is safe: the bot starts
 * from the chain head instead.
 */
class StateStore {
    constructor(filePath) {
        this.filePath = filePath;
    }

    async load() {
        try {
            const state = JSON.parse(await fs.readFile(this.filePath, 'utf8'));
            return {
                nextBlock: Number.isSafeInteger(state.nextBlock) && state.nextBlock > 0 ? state.nextBlock : null,
                recent: Array.isArray(state.recent) ? state.recent.filter((key) => typeof key === 'string') : []
            };
        } catch (error) {
            if (error.code !== 'ENOENT') logger.warn(`Ignoring unreadable state file: ${error.message}`);
            return { nextBlock: null, recent: [] };
        }
    }

    async save(state) {
        try {
            await fs.mkdir(path.dirname(this.filePath), { recursive: true });
            const temporary = `${this.filePath}.tmp`;
            await fs.writeFile(temporary, JSON.stringify(state));
            await fs.rename(temporary, this.filePath); // atomic, so a crash can't truncate it
        } catch (error) {
            logger.warn(`Could not save state: ${error.message}`);
        }
    }
}

module.exports = StateStore;
