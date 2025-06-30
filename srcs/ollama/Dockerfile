# ┌──────────────────────────────────────────────────────────────┐
# │ Dockerfile for a custom Ollama image                       │
# └──────────────────────────────────────────────────────────────┘

# 1) Base image: Ollama’s official CLI + server  
FROM ollama/ollama:latest

# 2) Allow setting the model via build-arg (default “gemma3:1b”)  
ARG MODEL=gemma3:1b

# 3) Pull the model into the image at build time  
RUN ollama pull ${MODEL}

# 4) Expose the default Ollama API port  
EXPOSE 11434

# 5) Use the default entrypoint (the `ollama` binary),
#    and tell it to serve on startup
ENTRYPOINT ["ollama"]
CMD ["serve", "--listen", "0.0.0.0:11434"]
