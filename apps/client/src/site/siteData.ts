export const salonContact = {
  email: "leticiacaio.borges30@gmail.com",
  instagram: "https://www.instagram.com/naildesigner.lleticia/",
  instagramHandle: "@naildesigner.lleticia",
};

export type Service = {
  name: string;
  description: string;
  detail: string;
  mark: string;
};

export const services: Service[] = [
  {
    name: "Manicure e pedicure",
    description: "Cuidado tradicional para mãos e pés, com acabamento limpo e delicado.",
    detail: "Cutilagem, formato, esmaltação e finalização para um resultado clássico.",
    mark: "M / P",
  },
  {
    name: "Esmaltação em gel",
    description: "Brilho intenso e durabilidade para manter as unhas bonitas por mais tempo.",
    detail: "Uma camada uniforme, resistente e com acabamento de salão.",
    mark: "GEL",
  },
  {
    name: "Banho de gel",
    description: "Estrutura e proteção para unhas naturais com visual leve e sofisticado.",
    detail: "Ideal para quem busca resistência sem perder a naturalidade.",
    mark: "BG",
  },
  {
    name: "Manutenção",
    description: "Aquele cuidado de continuidade para preservar o formato e o acabamento.",
    detail: "Avaliamos o crescimento e renovamos o que for preciso.",
    mark: "↻",
  },
];

export const availableTimes = [
  { time: "08:00", status: "free" },
  { time: "09:30", status: "busy" },
  { time: "11:00", status: "free" },
  { time: "13:00", status: "free" },
  { time: "14:30", status: "busy" },
  { time: "16:00", status: "free" },
  { time: "17:30", status: "free" },
  { time: "19:00", status: "busy" },
] as const;

export const dateOptions = [
  { label: "Hoje", value: "Hoje" },
  { label: "Amanhã", value: "Amanhã" },
  { label: "Sáb, 31 out", value: "Sábado, 31 de outubro" },
];

export const whatsappNumber = "5551998901388";

export function whatsappLink(message: string) {
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
}

