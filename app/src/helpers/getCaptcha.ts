export function getCaptcha() {
  const optionsLength = 4

  const randomOption = (from: number, to: number) => {
    return Math.ceil(Math.random() * to - 1 + from)
  }

  const question = Array.from({ length: 2 }) as number[]
  question[0] = randomOption(1, 10)
  question[1] = randomOption(1, 10)

  const answer = question[0] + question[1]

  const options: number[] = []

  while (options.length < optionsLength) {
    const option = randomOption(1, 20)
    if (!options.includes(option) && option !== answer) {
      options.push(option)
    }
  }

  options[randomOption(0, 3)] = answer

  return { question, answer, options }
}
