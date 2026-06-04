import { Node, TensorSpec, ValidationError, Shape } from '../types'
import { inferMatMulBatchShape } from '../utils/shape'

export const createMatMulNode = (
  id: string,
  position: { x: number; y: number },
  inputShapes: Shape[] = [['B', 'N', 'H'], ['B', 'H', 'K']]
): Node => {
  const inputTensors: TensorSpec[] = inputShapes.map(shape => ({ shape: [...shape], dtype: 'float32' }))

  const computeOutputShape = (shapes: Shape[]): Shape => {
    if (shapes.length < 2) return ['?']
    const a = shapes[0]
    const b = shapes[1]
    if (a.length < 2 || b.length < 2) return ['?']

    const aBatch = a.slice(0, -2)
    const bBatch = b.slice(0, -2)
    const aLast = a.slice(-2)
    const bLast = b.slice(-2)

    if (typeof aLast[1] === 'number' && typeof bLast[0] === 'number' && aLast[1] !== bLast[0]) {
      return ['?']
    }

    const batchShape = inferMatMulBatchShape(aBatch, bBatch)
    if (!batchShape) return ['?']

    return [...batchShape, aLast[0], bLast[1]]
  }

  const outputShape = computeOutputShape(inputShapes)
  const outputTensor: TensorSpec = { shape: outputShape, dtype: 'float32' }

  return {
    id,
    type: 'custom',
    position,
    data: {
      label: 'MatMul',
      nodeType: 'MatMul',
      inputs: [
        { id: 'a', name: 'a', type: 'input', tensor: inputTensors[0] },
        { id: 'b', name: 'b', type: 'input', tensor: inputTensors[1] }
      ],
      outputs: [{ id: 'out', name: 'out', type: 'output', tensor: outputTensor }],
      params: {}
    },
    runtime: {
      infer: (inputs: TensorSpec[]) => {
        if (inputs.length < 2) {
          return [{ shape: ['?'], dtype: 'float32' }]
        }

        const aShape = inputs[0].shape
        const bShape = inputs[1].shape

        if (aShape.length < 2 || bShape.length < 2) {
          return [{ shape: ['?'], dtype: inputs[0].dtype }]
        }

        const aBatch = aShape.slice(0, -2)
        const bBatch = bShape.slice(0, -2)
        const aLast = aShape.slice(-2)
        const bLast = bShape.slice(-2)

        const batchShape = inferMatMulBatchShape(aBatch, bBatch)
        if (!batchShape) {
          return [{ shape: ['?'], dtype: inputs[0].dtype }]
        }

        const outputShape: Shape = [...batchShape, aLast[0], bLast[1]]
        return [{ shape: outputShape, dtype: inputs[0].dtype }]
      },
      validate: (inputs: TensorSpec[]) => {
        const errors: ValidationError[] = []
        if (inputs.length < 2) {
          errors.push({ level: 'error', message: 'MatMul requires two inputs' })
        } else {
          const aShape = inputs[0].shape
          const bShape = inputs[1].shape

          if (aShape.length < 2) {
            errors.push({ level: 'error', message: 'Input A must have at least 2 dimensions' })
          }
          if (bShape.length < 2) {
            errors.push({ level: 'error', message: 'Input B must have at least 2 dimensions' })
          }

          if (aShape.length >= 2 && bShape.length >= 2) {
            const aLast = aShape.slice(-2)
            const bLast = bShape.slice(-2)

            if (typeof aLast[1] === 'number' && typeof bLast[0] === 'number' && aLast[1] !== bLast[0]) {
              errors.push({
                level: 'error',
                message: `Matrix dimensions mismatch: A(${aLast[1]}) != B(${bLast[0]})`
              })
            }

            const aBatch = aShape.slice(0, -2)
            const bBatch = bShape.slice(0, -2)
            if (aBatch.length > 0 || bBatch.length > 0) {
              const batchResult = inferMatMulBatchShape(aBatch, bBatch)
              if (!batchResult) {
                errors.push({
                  level: 'error',
                  message: 'Batch dimensions are not broadcastable'
                })
              }
            }
          }
        }
        return errors
      }
    }
  }
}
