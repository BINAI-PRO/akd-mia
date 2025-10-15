import type { NextApiRequest, NextApiResponse } from "next";

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = [{
    id: "sess-1",
    classType: "Reformer Basics",
    time: "11:00 AM",
    room: "Sala A",
    capacity: 10,
    occupancy: 7,
    attendees: [
      { id: "c1", name: "Ana López", status: "CONFIRMED" },
      { id: "c2", name: "P. Ruiz", status: "CHECKED_IN" },
    ]
  }];
  res.status(200).json(demo);
}
