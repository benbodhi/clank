function handleError(error, context) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ Error in ${context}:`);
    console.error(`[${timestamp}] Message: ${error.message}`);
    if (error.stack) {
        console.error(`[${timestamp}] Stack: ${error.stack}`);
    }
}

module.exports = { handleError }; 