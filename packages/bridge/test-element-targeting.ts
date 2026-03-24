/**
 * Test: Verify that CSS changes target the correct element (button, not hero section)
 *
 * Simulates the real extension payload where:
 * - User selects <button class="btn btn-primary"> inside <section class="hero">
 * - Grep resolver finds the section at line 377 (due to data-testid)
 * - CSS writer should use elementClasses=['btn','btn-primary'] to score .btn-primary
 *   instead of using the section's classes ['hero','text-black']
 */
import WebSocket from 'ws'

const WS_URL = 'ws://127.0.0.1:9119/ws'

async function test(): Promise<void> {
  const ws = new WebSocket(WS_URL)

  await new Promise<void>((resolve, reject) => {
    ws.on('open', resolve)
    ws.on('error', reject)
  })

  console.log('✓ Connected to bridge')

  // Send write:request simulating button color change
  // The selector references data-testid="hero-section" (ancestor),
  // but elementClasses/elementTag tell the writer the actual element is a button
  const writeRequest = {
    type: 'write:request',
    id: 'test-element-targeting-001',
    timestamp: new Date().toISOString(),
    payload: {
      selector: '[data-testid="hero-section"] > div > button:nth-of-type(1)',
      changes: [
        {
          property: 'backgroundColor',
          originalValue: 'rgb(99, 102, 241)',
          newValue: '#ff0000',
        },
      ],
      computedStyles: {
        'background-color': 'rgb(99, 102, 241)',
        color: 'rgb(255, 255, 255)',
      },
      url: 'http://localhost:5173',
      // NEW: element identity from the extension
      elementClasses: ['btn', 'btn-primary'],
      elementTag: 'button',
    },
  }

  ws.send(JSON.stringify(writeRequest))
  console.log('→ Sent write:request with elementClasses=["btn","btn-primary"]')

  // Wait for response
  const response = await new Promise<string>((resolve) => {
    ws.on('message', (data) => resolve(data.toString()))
  })

  const msg = JSON.parse(response)
  console.log('\n← Response type:', msg.type)

  if (msg.type === 'write:preview') {
    console.log('   File:', msg.payload.filePath)
    console.log('\n   Diff:')
    console.log(msg.payload.diff)

    // Verify the diff targets .btn-primary, NOT .hero
    const diff: string = msg.payload.diff
    console.log('\n   [Assertion checks]')

    // FAIL if the diff modifies .hero (the wrong rule)
    if (diff.includes('.hero')) {
      console.log('   ✗ FAIL: Diff contains ".hero" — change applied to the WRONG rule!')
      console.log('   The change should target .btn-primary (the button), not .hero (the section)')
      process.exit(1)
    }

    // PASS only if the diff modifies .btn-primary (the correct rule)
    if (diff.includes('.btn-primary')) {
      console.log('   ✓ Diff targets .btn-primary (correct)')
    } else if (diff.includes('.btn')) {
      console.log('   ~ Diff targets .btn (acceptable)')
    } else {
      console.log('   ✗ FAIL: Diff does not reference .btn-primary or .btn')
      console.log('   Actual diff:', diff.substring(0, 300))
      process.exit(1)
    }

    // Verify the actual property change is present
    if (!diff.includes('#ff0000') && !diff.includes('background')) {
      console.log('   ✗ FAIL: Diff does not contain the expected background-color change')
      process.exit(1)
    }

    console.log('   ✓ Background-color change present')
    console.log('\n✓ PASS: Change correctly targets the button, not the section')

    // Cancel the write (don't actually modify the file)
    ws.send(
      JSON.stringify({
        type: 'write:cancel',
        id: 'test-cancel-001',
        timestamp: new Date().toISOString(),
        payload: { requestId: 'test-element-targeting-001' },
      }),
    )
    console.log('→ Sent write:cancel (cleanup)')
  } else if (msg.type === 'write:result') {
    console.log('   Success:', msg.payload.success)
    console.log('   Error:', msg.payload.error)
    if (!msg.payload.success) {
      console.log('\n✗ FAIL: Write failed:', msg.payload.error)
      process.exit(1)
    }
  }

  ws.close()
  console.log('\nDone.')
}

test().catch((err) => {
  console.error('Test error:', err)
  process.exit(1)
})
