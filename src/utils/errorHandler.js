function handleError(error, context) {
    console.error(`❌ Error in ${context}:`, error.message);
    if (error.stack) console.error(error.stack);
}

module.exports = { handleError }; 