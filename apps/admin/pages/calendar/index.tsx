import type { GetServerSideProps } from "next";

const Index = () => null;

export const getServerSideProps: GetServerSideProps = async () => {
  return {
    redirect: {
      destination: "/calendar/day",
      permanent: false,
    },
  };
};

export default Index;
