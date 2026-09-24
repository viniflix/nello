import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export default function AdminFinancialPage() {
  return <div className="space-y-6">
    <div><p className="text-sm font-medium text-primary">Negócio · Nello</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Cobrança da plataforma</h1></div>
    <Card className="max-w-3xl rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2"><CreditCard className="h-5 w-5 text-primary" />Ainda sem fonte de cobrança integrada</CardTitle></CardHeader>
      <CardContent className="space-y-4 text-sm text-muted-foreground">
        <p>Não há integração de assinaturas e pagamentos da Nello reconciliada com este painel. Receita recorrente, churn, ticket e transações não podem ser calculados com segurança.</p>
        <p>O financeiro dos consultórios pertence aos nutricionistas e não representa receita da Nello. Quando uma fonte de cobrança for conectada, esta página poderá apresentar indicadores com período e origem explícitos.</p>
        <Button asChild variant="outline"><Link to="/admin/dashboard">Voltar à visão geral</Link></Button>
      </CardContent>
    </Card>
  </div>;
}
