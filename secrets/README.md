# secrets

Credenciais deste workspace, um arquivo por sistema: `<sistema>.local.json`. Tudo nesta pasta é
ignorado pelo git, menos este README.

Formato, sem valores reais aqui:

    {
      "url": "https://...",
      "token": "..."
    }

Quem lê é o script que chama a API, e ele não imprime o valor. O agente não abre estes arquivos sem
a tarefa pedir o valor, e nunca copia um valor para `.md`, log ou chat.
