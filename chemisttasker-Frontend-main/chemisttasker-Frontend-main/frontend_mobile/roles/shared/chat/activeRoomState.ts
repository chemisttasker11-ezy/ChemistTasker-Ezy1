let activeRoomId: number | null = null;

export function setActiveRoomId(roomId: number | null) {
  activeRoomId = roomId;
}

export function getActiveRoomId(): number | null {
  return activeRoomId;
}