FROM ollama/ollama:latest
ARG MODEL=gemma3:1b
EXPOSE 11434

# Start the server in the background and pull the model
RUN ollama serve & \
    sleep 5 && \
    ollama pull "${MODEL}" && \
    pkill ollama

ENTRYPOINT ["ollama"]
CMD ["serve"]
