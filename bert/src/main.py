from starlette.applications import Starlette
from starlette.responses import JSONResponse
from starlette.routing import Route
import asyncio
from ig.src.gpt import query

async def process(request):
    payload = await request.json()
    print(payload)
    # response_q = asyncio.Queue()
    # await request.app.model_queue.put((payload['message'], response_q))
    # output = await response_q.get()
    output = query(payload['message'])
    # print(output)
    return JSONResponse(payload)

app = Starlette(debug=True, routes=[
    Route('/', process, methods=["POST"]),
])