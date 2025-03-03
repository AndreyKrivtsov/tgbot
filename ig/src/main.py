from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
from transformers import pipeline
import asyncio
from ig.src.gpt import query

async def gpt(request):
    payload = await request.json()
    print(payload)
    # response_q = asyncio.Queue()
    # await request.app.model_queue.put((payload['message'], response_q))
    # output = await response_q.get()
    output = query(payload['message'])
    # print(output)
    return JSONResponse(payload)

async def gen(request):
    return JSONResponse({'hello': 'world'})

# async def server_loop(q):
#     pipe = pipeline(model="tinkoff-ai/ruDialoGPT-medium")
#     while True:
#         (string, response_q) = await q.get()
#         out = pipe(string)
#         await response_q.put(out)

app = Starlette(debug=True, routes=[
    Route('/gpt', gpt, methods=["POST"]),
    Route('/gen', gen, methods=["POST"]),
])

# @app.on_event("startup")
# async def startup_event():
#     q = asyncio.Queue()
#     app.model_queue = q
#     asyncio.create_task(server_loop(q))