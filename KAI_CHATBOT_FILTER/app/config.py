ELASTIC_SCHEMA= {
  "mappings": {
    "properties": {
    "sensitivetopic": {
        "type": "text",
        "fields": {
          "keyword": {
            "type": "keyword",
            # "ignore_above": 256
          }
        }
      },
    "sensitivetopic_embeddings": {
                    "type": "dense_vector",
                    "dims": 1536,
                    "index": True,
                    "similarity": "cosine"
                }   
        }
    },

  "settings": {
        "number_of_shards": 1,
  }
}