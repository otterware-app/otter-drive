// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DropdownMenu,
  DropdownMenuCheckItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from './menu'

afterEach(cleanup)

describe('DropdownMenu', () => {
  it('opens with a heading and check rows outside any group', async () => {
    const onPick = vi.fn()
    render(
      <DropdownMenu>
        <DropdownMenuTrigger>Sort</DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>Sort by</DropdownMenuLabel>
          <DropdownMenuCheckItem checked onClick={onPick}>
            Last updated
          </DropdownMenuCheckItem>
          <DropdownMenuCheckItem checked={false}>Title</DropdownMenuCheckItem>
        </DropdownMenuContent>
      </DropdownMenu>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Sort' }))
    expect(await screen.findByText('Sort by')).toBeTruthy()
    const current = screen.getByRole('menuitemcheckbox', {
      name: 'Last updated',
    })
    expect(current.getAttribute('aria-checked')).toBe('true')
    fireEvent.click(current)
    expect(onPick).toHaveBeenCalled()
  })
})
