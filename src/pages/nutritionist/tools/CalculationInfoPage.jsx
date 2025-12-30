import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrainCircuit } from 'lucide-react';

const CalculationCard = ({ title, description, formula, example }) => (
    <Card className="glass-card">
        <CardHeader>
            <CardTitle>{title}</CardTitle>
            <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
            {formula && (
                 <div>
                    <h4 className="font-semibold text-sm">Fórmula:</h4>
                    <pre className="p-2 bg-muted rounded-md text-sm whitespace-pre-wrap font-mono">{formula}</pre>
                </div>
            )}
            {example && (
                <div>
                    <h4 className="font-semibold text-sm">Exemplo Prático:</h4>
                    <p className="text-sm text-muted-foreground">{example}</p>
                </div>
            )}
        </CardContent>
    </Card>
);

const CalculationInfoPage = () => {
    const { user, signOut } = useAuth();
    
    return (
        <div className="min-h-screen bg-background">
            <main className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6">
                <CalculationCard 
                    title="Cálculo Nutricional de Refeições"
                    description="Como o sistema calcula os macronutrientes totais para cada refeição registrada pelo paciente."
                    formula={`Nutriente_Total = (Gramas_do_Alimento / 100) * Nutriente_por_100g`}
                    example="Se um paciente registra 150g de Arroz (que tem 28g de carboidratos por 100g), o cálculo é: (150 / 100) * 28 = 42g de carboidratos."
                />
                <CalculationCard 
                    title="Conversão de Medidas Caseiras"
                    description="O sistema converte medidas como 'colher de sopa' ou 'unidade' para gramas para manter a precisão."
                    formula={`Gramas_Finais = Quantidade_Medida * Fator_de_Conversao_em_Gramas`}
                    example="Se '1 colher de sopa de Azeite' equivale a 8g (fator de conversão), registrar '2 colheres de sopa' resultará em 16g para o cálculo nutricional."
                />
                 <CalculationCard 
                    title="Adesão à Dieta (%)"
                    description="O percentual de adesão diária e semanal é calculado comparando o consumo do paciente com as metas da prescrição."
                    formula={`Adesao_% = (Consumo_Total / Meta_Prescrita) * 100`}
                    example="Se a meta de calorias é 2000 kcal e o paciente consumiu 1800 kcal, a adesão é (1800 / 2000) * 100 = 90%."
                />
                <CalculationCard 
                    title="Cálculo de IMC (Índice de Massa Corporal)"
                    description="O IMC é calculado usando o peso e a altura do paciente."
                    formula={`IMC = Peso (kg) / (Altura (m) * Altura (m))`}
                    example="Um paciente com 70kg e 1.75m de altura tem um IMC de: 70 / (1.75 * 1.75) = 22.9."
                />
                <CalculationCard 
                    title="Calculadora de Macronutrientes"
                    description="Entenda o passo a passo de como a plataforma estima as necessidades calóricas e de macronutrientes."
                    formula={`1. TMB (Taxa Metabólica Basal - Fórmula Mifflin-St Jeor):
   - Homens: (10 * Peso) + (6.25 * Altura) - (5 * Idade) + 5
   - Mulheres: (10 * Peso) + (6.25 * Altura) - (5 * Idade) - 161

2. GET (Gasto Energético Total):
   - GET = TMB * Fator de Atividade

3. Calorias-Alvo:
   - Manter Peso: GET
   - Perder Peso: GET - 500 kcal
   - Ganhar Peso: GET + 500 kcal

4. Proteínas (g):
   - Proteínas = Peso * Ratio de Proteína (g/kg)

5. Gorduras (g):
   - Gorduras = (Calorias-Alvo * (% de Gordura / 100)) / 9

6. Carboidratos (g):
   - Carboidratos = (Calorias-Alvo - (Proteínas * 4) - (Gorduras * 9)) / 4`}
                    example="Um homem de 30 anos, 70kg, 175cm, com atividade moderada (fator 1.55) e objetivo de manter o peso, teria uma estimativa de 2756 kcal. A distribuição de macros seria então calculada com base nas preferências de proteína e gordura definidas."
                />
            </main>
        </div>
    );
};

export default CalculationInfoPage;