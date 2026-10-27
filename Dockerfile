FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY index.html .
COPY assets assets
COPY data data
COPY scripts/servidor.py scripts/servidor.py

# O banco de resumos fica num volume para sobreviver a novas versões da imagem.
ENV SIGTAP_HOST=0.0.0.0 \
    SIGTAP_PORTA=8000 \
    SIGTAP_RESUMOS_DB=/var/lib/sigtap/resumos.sqlite3
RUN mkdir -p /var/lib/sigtap && chown nobody /var/lib/sigtap
VOLUME /var/lib/sigtap
EXPOSE 8000

USER nobody
CMD ["python", "scripts/servidor.py"]
