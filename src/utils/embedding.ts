import { 
    QdrantVectorDB, 
    MilvusVectorDatabase,
    OpenAIEmbedding,
    VoyageAIEmbedding,
    GeminiEmbedding,
    OllamaEmbedding,
    LMStudioEmbedding,
    envManager,
} from '@vector-context/core';

export function createEmbedding() {
    const provider = envManager.get('EMBEDDING_PROVIDER') || 'LMStudio';
    const model = envManager.get('EMBEDDING_MODEL');
    
    switch (provider) {
        case 'OpenAI':
            return new OpenAIEmbedding({
                apiKey: envManager.get('OPENAI_API_KEY') || '',
                model: model || 'text-embedding-3-small',
                ...(envManager.get('OPENAI_BASE_URL') && { baseURL: envManager.get('OPENAI_BASE_URL') }),
            });
        case 'VoyageAI':
            return new VoyageAIEmbedding({
                apiKey: envManager.get('VOYAGEAI_API_KEY') || '',
                model: model || 'voyage-code-3',
            });
        case 'Gemini':
            return new GeminiEmbedding({
                apiKey: envManager.get('GEMINI_API_KEY') || '',
                model: model || 'gemini-embedding-001',
                ...(envManager.get('GEMINI_BASE_URL') && { baseURL: envManager.get('GEMINI_BASE_URL') }),
            });
        case 'Ollama':
            return new OllamaEmbedding({
                model: model || envManager.get('OLLAMA_MODEL') || 'nomic-embed-text',
                host: envManager.get('OLLAMA_HOST') || 'http://127.0.0.1:11434',
            });
        case 'LMStudio':
        default:
            return new LMStudioEmbedding({
                model: model || 'text-embedding-nomic-embed-text-v1.5',
                baseURL: envManager.get('LMSTUDIO_BASE_URL') || 'http://localhost:1234/v1',
            });
    }
}

export function createVectorDatabase() {
    const provider = envManager.get('VECTOR_STORE_PROVIDER') || 'Qdrant';
    
    if (provider === 'Qdrant') {
        return new QdrantVectorDB(envManager.get('QDRANT_ADDRESS') || 'http://localhost:6333');
    } else {
        return new MilvusVectorDatabase({
            address: envManager.get('MILVUS_ADDRESS'),
            ...(envManager.get('MILVUS_TOKEN') && { token: envManager.get('MILVUS_TOKEN') }),
        });
    }
}
